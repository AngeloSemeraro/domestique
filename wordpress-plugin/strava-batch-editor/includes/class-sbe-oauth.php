<?php
/**
 * Strava OAuth flow: login redirect, callback, logout, revoke.
 *
 * Routes (registered on rest_api_init):
 *   GET  /wp-json/sbe/v1/auth/login    → redirects user to Strava authorize page
 *   GET  /wp-json/sbe/v1/auth/callback → Strava redirects back here with ?code
 *   POST /wp-json/sbe/v1/auth/logout   → clears the WP user's token
 *   POST /wp-json/sbe/v1/auth/revoke   → also deauthorizes on Strava's side
 *
 * @package StravaBatchEditor
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
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			'sbe/v1',
			'/auth/login',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'login' ),
				'permission_callback' => '__return_true', // user must be logged into WP; checked inside.
			)
		);
		register_rest_route(
			'sbe/v1',
			'/auth/callback',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'callback' ),
				'permission_callback' => '__return_true',
			)
		);
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

	public function login( WP_REST_Request $req ) {
		if ( ! is_user_logged_in() ) {
			wp_safe_redirect( wp_login_url( $this->page_return_url( $req ) ) );
			exit;
		}
		if ( ! SBE_Plugin::is_configured() ) {
			return new WP_Error( 'sbe_not_configured', 'Plugin not configured (see Settings → Strava Batch Editor)', array( 'status' => 500 ) );
		}
		$settings = SBE_Plugin::get_settings();
		$state    = wp_generate_password( 24, false );
		set_transient( 'sbe_oauth_state_' . $state, array(
			'user_id' => get_current_user_id(),
			'return'  => $this->page_return_url( $req ),
		), 10 * MINUTE_IN_SECONDS );

		$params = array(
			'client_id'        => $settings['client_id'],
			'response_type'    => 'code',
			'redirect_uri'     => SBE_Plugin::oauth_redirect_uri(),
			'approval_prompt'  => 'auto',
			'scope'            => self::SCOPES,
			'state'            => $state,
		);
		wp_redirect( 'https://www.strava.com/oauth/authorize?' . http_build_query( $params ) );
		exit;
	}

	public function callback( WP_REST_Request $req ) {
		$code  = (string) $req->get_param( 'code' );
		$state = (string) $req->get_param( 'state' );
		$err   = (string) $req->get_param( 'error' );

		$state_data = $state ? get_transient( 'sbe_oauth_state_' . $state ) : false;
		if ( $state ) {
			delete_transient( 'sbe_oauth_state_' . $state );
		}
		if ( ! is_array( $state_data ) || ! isset( $state_data['user_id'] ) ) {
			return new WP_Error( 'sbe_bad_state', 'Invalid OAuth state', array( 'status' => 400 ) );
		}
		$return = is_string( $state_data['return'] ?? null ) ? $state_data['return'] : home_url( '/' );
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

	public function logout(): WP_REST_Response {
		SBE_Token_Store::clear( get_current_user_id() );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public function revoke(): WP_REST_Response {
		$tok = SBE_Token_Store::get( get_current_user_id() );
		$revoked = false;
		if ( $tok && ! empty( $tok['access_token'] ) ) {
			$resp = SBE_Strava_Client::deauthorize( (string) $tok['access_token'] );
			$revoked = ! is_wp_error( $resp );
		}
		SBE_Token_Store::clear( get_current_user_id() );
		return new WP_REST_Response( array( 'ok' => true, 'revoked' => $revoked ), 200 );
	}

	public function me(): WP_REST_Response|WP_Error {
		$tok = SBE_Token_Store::get( get_current_user_id() );
		if ( ! $tok ) {
			return new WP_REST_Response( array( 'authenticated' => false ), 200 );
		}
		$ath = SBE_Strava_Client::get( get_current_user_id(), '/athlete' );
		if ( is_wp_error( $ath ) ) {
			return new WP_REST_Response( array( 'authenticated' => false, 'error' => $ath->get_error_message() ), 200 );
		}
		return new WP_REST_Response(
			array(
				'authenticated' => true,
				'athlete'       => array(
					'id'     => (int) ( $ath['id'] ?? 0 ),
					'name'   => trim( ( $ath['firstname'] ?? '' ) . ' ' . ( $ath['lastname'] ?? '' ) ),
					'bikes'  => $ath['bikes'] ?? array(),
					'shoes'  => $ath['shoes'] ?? array(),
				),
			),
			200
		);
	}

	private function page_return_url( WP_REST_Request $req ): string {
		$return = $req->get_param( 'return' );
		if ( is_string( $return ) && $return !== '' ) {
			// allow only same-host returns
			$host = wp_parse_url( home_url(), PHP_URL_HOST );
			$rhost = wp_parse_url( $return, PHP_URL_HOST );
			if ( $rhost === $host ) {
				return $return;
			}
		}
		return home_url( '/' );
	}
}
