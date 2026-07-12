<?php
/**
 * Optional RideWithGPS integration: per-user OAuth + trip upload proxy.
 *
 * Mirrors the Strava flow: browser-facing OAuth handlers hang off
 * admin-post.php (so WordPress cookie auth applies during navigation),
 * JSON endpoints live on the REST API and are called by the React bundle
 * with an X-WP-Nonce header.
 *
 * RWGPS API specifics are centralized here; official docs:
 * https://ridewithgps.com/api/v1/doc — the site admin registers an API
 * client on their RideWithGPS account and pastes the credentials in
 * Settings → Strava Batch Editor.
 *
 * @package StravaBatchEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_RWGPS {

	private const META_KEY = '_sbe_rwgps_token';
	private const BASE     = 'https://ridewithgps.com';

	private static ?SBE_RWGPS $instance = null;
	public static function instance(): SBE_RWGPS {
		return self::$instance ?? ( self::$instance = new self() );
	}

	public function register(): void {
		add_action( 'admin_post_sbe_rwgps_login', array( $this, 'admin_post_login' ) );
		add_action( 'admin_post_nopriv_sbe_rwgps_login', array( $this, 'admin_post_login' ) );
		add_action( 'admin_post_sbe_rwgps_callback', array( $this, 'admin_post_callback' ) );
		add_action( 'admin_post_nopriv_sbe_rwgps_callback', array( $this, 'admin_post_callback' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
	}

	public static function login_url( string $return = '' ): string {
		$url = admin_url( 'admin-post.php?action=sbe_rwgps_login' );
		if ( $return !== '' ) {
			$url = add_query_arg( 'return', rawurlencode( $return ), $url );
		}
		return $url;
	}

	public static function redirect_uri(): string {
		return admin_url( 'admin-post.php?action=sbe_rwgps_callback' );
	}

	public static function is_configured(): bool {
		$s = SBE_Plugin::get_settings();
		return $s['rwgps_client_id'] !== '' && $s['rwgps_client_secret'] !== '';
	}

	public function register_rest_routes(): void {
		$auth = array( SBE_OAuth::instance(), 'require_logged_in' );

		register_rest_route(
			'sbe/v1',
			'/rwgps/me',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'me' ),
				'permission_callback' => $auth,
			)
		);
		register_rest_route(
			'sbe/v1',
			'/rwgps/auth/logout',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'logout' ),
				'permission_callback' => $auth,
			)
		);
		register_rest_route(
			'sbe/v1',
			'/rwgps/trips',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'upload_trip' ),
				'permission_callback' => $auth,
			)
		);
	}

	/* ---- Browser-facing OAuth handlers ---- */

	public function admin_post_login(): void {
		$return = isset( $_GET['return'] ) ? esc_url_raw( wp_unslash( (string) $_GET['return'] ) ) : home_url( '/' );
		$return = $this->safe_return( $return );

		if ( ! is_user_logged_in() ) {
			wp_safe_redirect( wp_login_url( self::login_url( $return ) ) );
			exit;
		}
		if ( ! self::is_configured() ) {
			wp_die( esc_html__( 'RideWithGPS is not configured (Settings → Strava Batch Editor).', 'strava-batch-editor' ) );
		}
		$settings = SBE_Plugin::get_settings();
		$state    = wp_generate_password( 24, false );
		set_transient(
			'sbe_rwgps_state_' . $state,
			array(
				'user_id' => get_current_user_id(),
				'return'  => $return,
			),
			10 * MINUTE_IN_SECONDS
		);

		$params = array(
			'client_id'     => $settings['rwgps_client_id'],
			'redirect_uri'  => self::redirect_uri(),
			'response_type' => 'code',
			'state'         => $state,
		);
		wp_redirect( self::BASE . '/oauth/authorize?' . http_build_query( $params ) );
		exit;
	}

	public function admin_post_callback(): void {
		$code  = isset( $_GET['code'] ) ? (string) wp_unslash( $_GET['code'] ) : '';
		$state = isset( $_GET['state'] ) ? (string) wp_unslash( $_GET['state'] ) : '';
		$err   = isset( $_GET['error'] ) ? (string) wp_unslash( $_GET['error'] ) : '';

		$state_data = $state ? get_transient( 'sbe_rwgps_state_' . $state ) : false;
		if ( $state ) {
			delete_transient( 'sbe_rwgps_state_' . $state );
		}
		if ( ! is_array( $state_data ) || ! isset( $state_data['user_id'] ) ) {
			wp_die( esc_html__( 'Invalid OAuth state. Please start the RideWithGPS connection again.', 'strava-batch-editor' ) );
		}
		$return = is_string( $state_data['return'] ?? null ) ? $this->safe_return( (string) $state_data['return'] ) : home_url( '/' );

		if ( $err || ! $code ) {
			wp_safe_redirect( add_query_arg( 'sbe_rwgps_error', rawurlencode( $err ?: 'missing_code' ), $return ) );
			exit;
		}

		$settings = SBE_Plugin::get_settings();
		$res      = wp_remote_post(
			self::BASE . '/oauth/token',
			array(
				'timeout' => 20,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'grant_type'    => 'authorization_code',
						'code'          => $code,
						'client_id'     => $settings['rwgps_client_id'],
						'client_secret' => $settings['rwgps_client_secret'],
						'redirect_uri'  => self::redirect_uri(),
					)
				),
			)
		);
		$body = is_wp_error( $res ) ? array() : json_decode( wp_remote_retrieve_body( $res ), true );
		if ( is_wp_error( $res ) || empty( $body['access_token'] ) ) {
			wp_safe_redirect( add_query_arg( 'sbe_rwgps_error', 'token_exchange_failed', $return ) );
			exit;
		}

		$name = null;
		$user = $this->api_get( (string) $body['access_token'], '/api/v1/users/current.json' );
		if ( is_array( $user ) ) {
			$u    = $user['user'] ?? $user;
			$name = $u['name'] ?? ( $u['display_name'] ?? null );
		}

		update_user_meta(
			(int) $state_data['user_id'],
			self::META_KEY,
			array(
				'access_token' => (string) $body['access_token'],
				'name'         => $name,
			)
		);
		wp_safe_redirect( add_query_arg( 'sbe_rwgps_connected', '1', $return ) );
		exit;
	}

	/* ---- JSON endpoints ---- */

	public function me(): WP_REST_Response {
		$tok = get_user_meta( get_current_user_id(), self::META_KEY, true );
		return new WP_REST_Response(
			array(
				'configured' => self::is_configured(),
				'connected'  => is_array( $tok ) && ! empty( $tok['access_token'] ),
				'name'       => is_array( $tok ) ? ( $tok['name'] ?? null ) : null,
			),
			200
		);
	}

	public function logout(): WP_REST_Response {
		delete_user_meta( get_current_user_id(), self::META_KEY );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public function upload_trip( WP_REST_Request $req ): WP_REST_Response|WP_Error {
		$tok = get_user_meta( get_current_user_id(), self::META_KEY, true );
		if ( ! is_array( $tok ) || empty( $tok['access_token'] ) ) {
			return new WP_Error( 'sbe_rwgps_unauthorized', 'Not connected to RideWithGPS', array( 'status' => 401 ) );
		}
		$body = $req->get_json_params();
		$gpx  = isset( $body['gpx'] ) ? (string) $body['gpx'] : '';
		$name = isset( $body['name'] ) ? (string) $body['name'] : '';
		if ( $gpx === '' || $name === '' ) {
			return new WP_Error( 'sbe_bad_request', 'gpx content and name required', array( 'status' => 400 ) );
		}
		$description = isset( $body['description'] ) ? (string) $body['description'] : '';
		$token       = (string) $tok['access_token'];
		$settings    = SBE_Plugin::get_settings();
		$api_key     = $settings['rwgps_api_key'] !== '' ? $settings['rwgps_api_key'] : $settings['rwgps_client_id'];

		// Try the v1 endpoint first, fall back to the legacy upload route
		// (see class docblock) when v1 isn't available for this API client.
		$attempts = array(
			array(
				'url'    => self::BASE . '/api/v1/trips.json',
				'extra'  => array(),
				'apikey' => $api_key,
			),
			array(
				'url'    => self::BASE . '/trips.json',
				'extra'  => array(
					'apikey'     => $api_key,
					'version'    => '2',
					'auth_token' => $token,
				),
				'apikey' => $api_key,
			),
		);

		$last_error  = 'upload failed';
		$last_status = 502;
		foreach ( $attempts as $attempt ) {
			$boundary = wp_generate_password( 24, false );
			$fields   = array_merge(
				array(
					'trip[name]'        => $name,
					'trip[description]' => $description,
				),
				$attempt['extra']
			);
			$payload = '';
			foreach ( $fields as $k => $v ) {
				if ( $v === '' ) {
					continue;
				}
				$payload .= "--$boundary\r\n";
				$payload .= "Content-Disposition: form-data; name=\"$k\"\r\n\r\n$v\r\n";
			}
			$payload .= "--$boundary\r\n";
			$payload .= "Content-Disposition: form-data; name=\"file\"; filename=\"" . sanitize_file_name( $name ) . ".gpx\"\r\n";
			$payload .= "Content-Type: application/gpx+xml\r\n\r\n$gpx\r\n";
			$payload .= "--$boundary--\r\n";

			$res = wp_remote_post(
				$attempt['url'],
				array(
					'timeout' => 60,
					'headers' => array(
						'Content-Type'    => 'multipart/form-data; boundary=' . $boundary,
						'Authorization'   => 'Bearer ' . $token,
						'x-rwgps-api-key' => $attempt['apikey'],
						'Accept'          => 'application/json',
					),
					'body'    => $payload,
				)
			);
			if ( is_wp_error( $res ) ) {
				$last_error = $res->get_error_message();
				continue;
			}
			$status = (int) wp_remote_retrieve_response_code( $res );
			$data   = json_decode( wp_remote_retrieve_body( $res ), true );
			if ( $status >= 200 && $status < 300 ) {
				$trip = is_array( $data ) ? ( $data['trip'] ?? $data ) : array();
				$id   = is_array( $trip ) && isset( $trip['id'] ) ? (int) $trip['id'] : null;
				return new WP_REST_Response(
					array(
						'ok'      => true,
						'trip_id' => $id,
						'url'     => $id ? 'https://ridewithgps.com/trips/' . $id : null,
					),
					200
				);
			}
			$last_status = $status;
			$last_error  = is_array( $data ) && isset( $data['error'] ) ? (string) $data['error'] : 'RideWithGPS ' . $status;
			// Auth / validation errors are final; only 404-ish falls through.
			if ( ! in_array( $status, array( 404, 405, 410 ), true ) ) {
				break;
			}
		}
		return new WP_Error( 'sbe_rwgps_upload', $last_error, array( 'status' => $last_status ?: 502 ) );
	}

	/* ---- helpers ---- */

	private function api_get( string $token, string $path ): ?array {
		$settings = SBE_Plugin::get_settings();
		$api_key  = $settings['rwgps_api_key'] !== '' ? $settings['rwgps_api_key'] : $settings['rwgps_client_id'];
		$res      = wp_remote_get(
			self::BASE . $path,
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization'   => 'Bearer ' . $token,
					'x-rwgps-api-key' => $api_key,
					'Accept'          => 'application/json',
				),
			)
		);
		if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) >= 400 ) {
			return null;
		}
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		return is_array( $data ) ? $data : null;
	}

	private function safe_return( string $url ): string {
		$host  = wp_parse_url( home_url(), PHP_URL_HOST );
		$rhost = wp_parse_url( $url, PHP_URL_HOST );
		if ( $rhost === $host ) {
			return $url;
		}
		return home_url( '/' );
	}
}
