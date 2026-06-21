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
	 * Returns the redirect URI we send to Strava during OAuth. Site-relative
	 * so it Just Works whether WP is on a sub-path or its own domain.
	 */
	public static function oauth_redirect_uri(): string {
		return rest_url( 'sbe/v1/auth/callback' );
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
