<?php
/**
 * Strava OAuth flow.
 *
 * The user-facing redirects (login + callback) hang off admin-post.php
 * so they honour the regular WordPress cookie auth during plain browser
 * navigation:
 *
 *   /wp-admin/admin-post.php?action=sbe_oauth_login&return=…
 *   /wp-admin/admin-post.php?action=sbe_oauth_callback?code=…&state=…
 *
 * Logout / revoke / me stay on the REST API because they're hit via
 * fetch() from the React bundle with the X-WP-Nonce header.
 *
 * @package Domestique
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_OAuth {

	private const SCOPES = 'read,activity:read_all,activity:write,profile:read_all';

	private static ?SBE_OAuth $instance = null;
	public static function instance(): SBE_OAuth {
		return self::$instance ?? ( self::$instance = new self() );
	}

	public function register(): void {
		// Browser-facing OAuth handlers — admin-post.php sees WP cookies.
		add_action( 'admin_post_sbe_oauth_login', array( $this, 'admin_post_login' ) );
		add_action( 'admin_post_nopriv_sbe_oauth_login', array( $this, 'admin_post_login' ) );
		add_action( 'admin_post_sbe_oauth_callback', array( $this, 'admin_post_callback' ) );
		add_action( 'admin_post_nopriv_sbe_oauth_callback', array( $this, 'admin_post_callback' ) );

		// JSON endpoints that the React bundle calls.
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
	}

	public function register_rest_routes(): void {
		register_rest_route(
			'sbe/v1',
			'/auth/logout',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'logout' ),
				'permission_callback' => array( $this, 'require_logged_in' ),
			)
		);
		register_rest_route(
			'sbe/v1',
			'/auth/revoke',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'revoke' ),
				'permission_callback' => array( $this, 'require_logged_in' ),
			)
		);
		register_rest_route(
			'sbe/v1',
			'/me',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'me' ),
				'permission_callback' => array( $this, 'require_logged_in' ),
			)
		);
	}

	public function require_logged_in(): bool|WP_Error {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'sbe_unauthorized', 'You must be logged in', array( 'status' => 401 ) );
		}
		return true;
	}

	/* ---- Browser-facing handlers (admin-post.php) ---- */

	public function admin_post_login(): void {
		$return = isset( $_GET['return'] ) ? esc_url_raw( wp_unslash( (string) $_GET['return'] ) ) : home_url( '/' );
		$return = $this->safe_return( $return );

		if ( ! is_user_logged_in() ) {
			wp_safe_redirect( wp_login_url( SBE_Plugin::oauth_login_url( $return ) ) );
			exit;
		}
		if ( ! SBE_Plugin::is_configured() ) {
			wp_die( esc_html__( 'Domestique is not configured (Settings → Domestique).', 'domestique' ) );
		}
		$settings = SBE_Plugin::get_settings();
		$state    = wp_generate_password( 24, false );
		set_transient(
			'sbe_oauth_state_' . $state,
			array(
				'user_id' => get_current_user_id(),
				'return'  => $return,
			),
			10 * MINUTE_IN_SECONDS
		);

		$params = array(
			'client_id'       => $settings['client_id'],
			'response_type'   => 'code',
			'redirect_uri'    => SBE_Plugin::oauth_redirect_uri(),
			'approval_prompt' => 'auto',
			'scope'           => self::SCOPES,
			'state'           => $state,
		);
		wp_redirect( 'https://www.strava.com/oauth/authorize?' . http_build_query( $params ) );
		exit;
	}

	public function admin_post_callback(): void {
		$code  = isset( $_GET['code'] ) ? (string) wp_unslash( $_GET['code'] ) : '';
		$state = isset( $_GET['state'] ) ? (string) wp_unslash( $_GET['state'] ) : '';
		$err   = isset( $_GET['error'] ) ? (string) wp_unslash( $_GET['error'] ) : '';

		$state_data = $state ? get_transient( 'sbe_oauth_state_' . $state ) : false;
		if ( $state ) {
			delete_transient( 'sbe_oauth_state_' . $state );
		}
		if ( ! is_array( $state_data ) || ! isset( $state_data['user_id'] ) ) {
			wp_die( esc_html__( 'Invalid OAuth state. Please start the connection again.', 'domestique' ) );
		}
		$return = is_string( $state_data['return'] ?? null ) ? $this->safe_return( (string) $state_data['return'] ) : home_url( '/' );

		if ( $err || ! $code ) {
			wp_safe_redirect( add_query_arg( 'sbe_error', rawurlencode( $err ?: 'missing_code' ), $return ) );
			exit;
		}

		$token = SBE_Strava_Client::exchange_code( $code );
		if ( is_wp_error( $token ) ) {
			wp_safe_redirect( add_query_arg( 'sbe_error', rawurlencode( $token->get_error_message() ), $return ) );
			exit;
		}

		SBE_Token_Store::save(
			(int) $state_data['user_id'],
			array(
				'access_token'  => (string) $token['access_token'],
				'refresh_token' => (string) $token['refresh_token'],
				'expires_at'    => (int) $token['expires_at'],
				'athlete'       => isset( $token['athlete'] ) ? $token['athlete'] : null,
			)
		);
		wp_safe_redirect( add_query_arg( 'sbe_connected', '1', $return ) );
		exit;
	}

	/* ---- JSON endpoints (REST) ---- */

	public function logout(): WP_REST_Response {
		SBE_Token_Store::clear( get_current_user_id() );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public function revoke(): WP_REST_Response {
		$tok     = SBE_Token_Store::get( get_current_user_id() );
		$revoked = false;
		if ( $tok && ! empty( $tok['access_token'] ) ) {
			$resp    = SBE_Strava_Client::deauthorize( (string) $tok['access_token'] );
			$revoked = ! is_wp_error( $resp );
		}
		SBE_Token_Store::clear( get_current_user_id() );
		return new WP_REST_Response( array( 'ok' => true, 'revoked' => $revoked ), 200 );
	}

	public function me(): WP_REST_Response {
		$tok = SBE_Token_Store::get( get_current_user_id() );
		if ( ! $tok ) {
			return new WP_REST_Response( array( 'authenticated' => false ), 200 );
		}
		$ath = SBE_Strava_Client::get( get_current_user_id(), '/athlete' );
		if ( is_wp_error( $ath ) ) {
			return new WP_REST_Response(
				array(
					'authenticated' => false,
					'error'         => $ath->get_error_message(),
				),
				200
			);
		}
		return new WP_REST_Response(
			array(
				'authenticated' => true,
				'athlete'       => array(
					'id'    => (int) ( $ath['id'] ?? 0 ),
					'name'  => trim( ( $ath['firstname'] ?? '' ) . ' ' . ( $ath['lastname'] ?? '' ) ),
					'bikes' => $ath['bikes'] ?? array(),
					'shoes' => $ath['shoes'] ?? array(),
				),
			),
			200
		);
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
