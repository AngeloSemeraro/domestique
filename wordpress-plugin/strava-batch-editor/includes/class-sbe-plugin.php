<?php
/**
 * Plugin bootstrap: registers WordPress hooks for all subsystems.
 *
 * @package StravaBatchEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_Plugin {

	private static ?SBE_Plugin $instance = null;

	public static function instance(): SBE_Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	public function init(): void {
		add_action( 'plugins_loaded', array( $this, 'load_textdomain' ) );

		SBE_Admin::instance()->register();
		SBE_OAuth::instance()->register();
		SBE_REST::instance()->register();
		SBE_Shortcode::instance()->register();
	}

	public function load_textdomain(): void {
		load_plugin_textdomain(
			'strava-batch-editor',
			false,
			dirname( plugin_basename( SBE_PLUGIN_FILE ) ) . '/languages'
		);
	}

	/**
	 * Returns the redirect URI we send to Strava during OAuth. We use
	 * admin-post.php (not a REST route) because REST endpoints in WordPress
	 * don't honour the auth cookies during plain browser navigation —
	 * `is_user_logged_in()` returns false there without an X-WP-Nonce
	 * header, which broke the OAuth start flow.
	 */
	public static function oauth_redirect_uri(): string {
		return admin_url( 'admin-post.php?action=sbe_oauth_callback' );
	}

	public static function oauth_login_url( string $return = '' ): string {
		$url = admin_url( 'admin-post.php?action=sbe_oauth_login' );
		if ( $return !== '' ) {
			$url = add_query_arg( 'return', rawurlencode( $return ), $url );
		}
		return $url;
	}

	/**
	 * Returns the saved settings (Client ID / Secret) with defaults.
	 *
	 * @return array{client_id:string,client_secret:string}
	 */
	public static function get_settings(): array {
		$opts = get_option( SBE_OPTION_KEY, array() );
		return array(
			'client_id'     => isset( $opts['client_id'] ) ? (string) $opts['client_id'] : '',
			'client_secret' => isset( $opts['client_secret'] ) ? (string) $opts['client_secret'] : '',
		);
	}

	public static function is_configured(): bool {
		$s = self::get_settings();
		return $s['client_id'] !== '' && $s['client_secret'] !== '';
	}
}
