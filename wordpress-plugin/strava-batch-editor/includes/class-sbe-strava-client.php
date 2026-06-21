<?php
/**
 * Thin HTTP client for the Strava API. Handles token refresh transparently.
 *
 * @package StravaBatchEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_Strava_Client {

	private const API_BASE   = 'https://www.strava.com/api/v3';
	private const OAUTH_BASE = 'https://www.strava.com/oauth';

	public static function exchange_code( string $code ): array|WP_Error {
		$settings = SBE_Plugin::get_settings();
		$res      = wp_remote_post(
			self::OAUTH_BASE . '/token',
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'client_id'     => $settings['client_id'],
						'client_secret' => $settings['client_secret'],
						'code'          => $code,
						'grant_type'    => 'authorization_code',
					)
				),
			)
		);
		return self::unwrap_json( $res );
	}

	public static function refresh( string $refresh_token ): array|WP_Error {
		$settings = SBE_Plugin::get_settings();
		$res      = wp_remote_post(
			self::OAUTH_BASE . '/token',
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'client_id'     => $settings['client_id'],
						'client_secret' => $settings['client_secret'],
						'grant_type'    => 'refresh_token',
						'refresh_token' => $refresh_token,
					)
				),
			)
		);
		return self::unwrap_json( $res );
	}

	public static function deauthorize( string $access_token ): array|WP_Error {
		$res = wp_remote_post(
			self::OAUTH_BASE . '/deauthorize?access_token=' . rawurlencode( $access_token ),
			array( 'timeout' => 10 )
		);
		return self::unwrap_json( $res );
	}

	/**
	 * Returns a fresh access token for the given WP user, refreshing if needed.
	 */
	public static function valid_access_token( int $user_id ): string|WP_Error {
		$tok = SBE_Token_Store::get( $user_id );
		if ( ! $tok || empty( $tok['refresh_token'] ) ) {
			return new WP_Error( 'sbe_not_connected', 'Strava not connected for this user' );
		}
		if ( empty( $tok['expires_at'] ) || $tok['expires_at'] - 60 < time() ) {
			$refreshed = self::refresh( (string) $tok['refresh_token'] );
			if ( is_wp_error( $refreshed ) ) {
				return $refreshed;
			}
			$tok['access_token']  = (string) $refreshed['access_token'];
			$tok['refresh_token'] = (string) $refreshed['refresh_token'];
			$tok['expires_at']    = (int) $refreshed['expires_at'];
			SBE_Token_Store::save( $user_id, $tok );
		}
		return (string) $tok['access_token'];
	}

	/**
	 * Authenticated GET to the Strava API. $path starts with /.
	 */
	public static function get( int $user_id, string $path, array $query = array() ): array|WP_Error {
		$token = self::valid_access_token( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$url = self::API_BASE . $path;
		if ( ! empty( $query ) ) {
			$url .= '?' . http_build_query( $query );
		}
		$res = wp_remote_get(
			$url,
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Bearer ' . $token ),
			)
		);
		return self::unwrap_json( $res );
	}

	/**
	 * Authenticated PUT (used for activity updates).
	 */
	public static function put( int $user_id, string $path, array $body ): array|WP_Error {
		$token = self::valid_access_token( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$res = wp_remote_request(
			self::API_BASE . $path,
			array(
				'method'  => 'PUT',
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);
		return self::unwrap_json( $res );
	}

	/**
	 * Authenticated multipart POST (used for file uploads).
	 */
	public static function upload_file( int $user_id, string $content, string $data_type, array $meta ): array|WP_Error {
		$token = self::valid_access_token( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$boundary = '----SBE' . wp_generate_password( 20, false );
		$mime     = $data_type === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml';
		$ext      = $data_type === 'tcx' ? 'tcx' : 'gpx';

		$parts   = array();
		$fields  = array_merge( array( 'data_type' => $data_type ), $meta );
		foreach ( $fields as $name => $val ) {
			$parts[] = "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$val";
		}
		$parts[] = "--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"merged.$ext\"\r\nContent-Type: $mime\r\n\r\n$content";
		$body    = implode( "\r\n", $parts ) . "\r\n--$boundary--\r\n";

		$res = wp_remote_post(
			self::API_BASE . '/uploads',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'multipart/form-data; boundary=' . $boundary,
				),
				'body'    => $body,
			)
		);
		return self::unwrap_json( $res );
	}

	private static function unwrap_json( $res ): array|WP_Error {
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = wp_remote_retrieve_response_code( $res );
		$body = wp_remote_retrieve_body( $res );
		$data = json_decode( $body, true );
		if ( ! is_array( $data ) ) {
			$data = array();
		}
		if ( $code < 200 || $code >= 300 ) {
			$msg = isset( $data['message'] ) ? (string) $data['message'] : "Strava $code";
			return new WP_Error( 'sbe_strava_' . $code, $msg, array( 'status' => $code, 'raw' => $data ) );
		}
		return $data;
	}
}
