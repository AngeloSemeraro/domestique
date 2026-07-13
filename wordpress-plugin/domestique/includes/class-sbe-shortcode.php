<?php
/**
 * Shortcodes that render the app inside any WordPress page or post.
 *
 *   [domestique]                       full app, all three tabs
 *   [domestique tab="edit"]            Batch edit only
 *   [domestique tab="merge"]           Merge rides only
 *   [domestique tab="inspector"]       Inspector only
 *   [domestique_login]                 just the Connect button
 *
 * The React bundle (assets/js/app.iife.js + assets/css/app.css) is enqueued
 * lazily — only on pages that actually contain a shortcode — and reads the
 * bootstrap data from a window.SBE_BOOTSTRAP block printed inline.
 *
 * @package Domestique
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_Shortcode {

	private static ?SBE_Shortcode $instance = null;
	public static function instance(): SBE_Shortcode {
		return self::$instance ?? ( self::$instance = new self() );
	}

	private bool $assets_enqueued = false;

	public function register(): void {
		add_shortcode( 'domestique', array( $this, 'render_app' ) );
		add_shortcode( 'domestique_login', array( $this, 'render_login_button' ) );
		// Legacy aliases from before the rename to Domestique, kept so pages
		// published with the old shortcodes keep working. Prefer [domestique].
		add_shortcode( 'strava_batch_editor', array( $this, 'render_app' ) );
		add_shortcode( 'strava_batch_editor_login', array( $this, 'render_login_button' ) );
	}

	public function render_app( $atts ): string {
		$atts = shortcode_atts(
			array(
				'tab' => 'all',
			),
			$atts,
			'domestique'
		);

		if ( ! is_user_logged_in() ) {
			return $this->wp_login_notice();
		}
		if ( ! SBE_Plugin::is_configured() ) {
			return $this->not_configured_notice();
		}

		$this->enqueue_assets();
		$tab = sanitize_key( (string) $atts['tab'] );
		$id  = 'sbe-root-' . wp_generate_password( 8, false );

		$bundle_missing = ! file_exists( SBE_PLUGIN_DIR . 'assets/js/app.iife.js' );

		if ( $bundle_missing && current_user_can( 'manage_options' ) ) {
			return $this->bundle_missing_notice();
		}
		if ( $bundle_missing ) {
			return $this->bundle_missing_user_notice();
		}

		return sprintf(
			'<div class="sbe-mount" id="%s" data-sbe-mount="1" data-sbe-tab="%s"><div style="padding:1rem;color:#888;font:14px/1.4 system-ui">' . esc_html__( 'Loading Domestique…', 'domestique' ) . '</div></div>',
			esc_attr( $id ),
			esc_attr( in_array( $tab, array( 'edit', 'merge', 'inspector', 'all' ), true ) ? $tab : 'all' )
		);
	}

	public function render_login_button( $atts ): string {
		$atts = shortcode_atts( array( 'label' => __( 'Connect with Strava', 'domestique' ) ), $atts );

		if ( ! is_user_logged_in() ) {
			return $this->wp_login_notice();
		}
		if ( ! SBE_Plugin::is_configured() ) {
			return $this->not_configured_notice();
		}
		$url = SBE_Plugin::oauth_login_url( $this->current_url() );
		return sprintf(
			'<a class="sbe-connect-btn" href="%s" style="display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1.1rem;border-radius:9999px;background:#FC4C02;color:#fff;font-weight:600;text-decoration:none;">%s</a>',
			esc_url( $url ),
			esc_html( (string) $atts['label'] )
		);
	}

	/**
	 * Adds the React bundle once per request, and emits the bootstrap object
	 * the bundle reads on mount.
	 */
	private function enqueue_assets(): void {
		if ( $this->assets_enqueued ) {
			return;
		}
		$this->assets_enqueued = true;

		$js_path = SBE_PLUGIN_DIR . 'assets/js/app.iife.js';
		$css_path = SBE_PLUGIN_DIR . 'assets/css/app.css';

		if ( file_exists( $css_path ) ) {
			wp_enqueue_style(
				'sbe-app',
				SBE_PLUGIN_URL . 'assets/css/app.css',
				array(),
				file_exists( $css_path ) ? filemtime( $css_path ) : SBE_VERSION
			);
		}
		if ( file_exists( $js_path ) ) {
			wp_enqueue_script(
				'sbe-app',
				SBE_PLUGIN_URL . 'assets/js/app.iife.js',
				array(),
				filemtime( $js_path ),
				true
			);
		}

		$bootstrap = array(
			'restRoot'  => esc_url_raw( rest_url( 'sbe/v1' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'loginUrl'  => esc_url_raw( SBE_Plugin::oauth_login_url( $this->current_url() ) ),
			'logoutUrl' => esc_url_raw( rest_url( 'sbe/v1/auth/logout' ) ),
			'revokeUrl' => esc_url_raw( rest_url( 'sbe/v1/auth/revoke' ) ),
			'meUrl'     => esc_url_raw( rest_url( 'sbe/v1/me' ) ),
			'iconUrl'   => esc_url_raw( SBE_PLUGIN_URL . 'assets/icon.png' ),
			'version'   => SBE_VERSION,
		);
		if ( SBE_RWGPS::is_configured() ) {
			$bootstrap['rwgpsLoginUrl'] = esc_url_raw( SBE_RWGPS::login_url( $this->current_url() ) );
		}
		wp_add_inline_script(
			'sbe-app',
			'window.SBE_BOOTSTRAP = ' . wp_json_encode( $bootstrap ) . ';',
			'before'
		);
	}

	private function bundle_missing_notice(): string {
		return sprintf(
			'<div class="sbe-notice" style="padding:1rem;border:1px solid #d63638;border-radius:.5rem;background:#fcf0f1;color:#000;font-family:system-ui;font-size:13px;line-height:1.5;">
				<strong>%1$s</strong><br>%2$s
				<pre style="background:#fff;border:1px solid #ddd;padding:.6rem;margin:.6rem 0 0;overflow:auto;font-size:12px;border-radius:.3rem;">cd wordpress-plugin
npm install
npm run build</pre>
				%3$s
			</div>',
			esc_html__( 'Domestique: React bundle not built yet.', 'domestique' ),
			esc_html__( 'The plugin folder is missing assets/js/app.iife.js. Build the bundle from the project sources:', 'domestique' ),
			esc_html__( 'Then copy assets/js/app.iife.js and assets/css/app.css into this plugin folder. (Visible to admins only.)', 'domestique' )
		);
	}

	private function bundle_missing_user_notice(): string {
		return sprintf(
			'<div class="sbe-notice" style="padding:1rem;border:1px solid #ddd;border-radius:.5rem;background:#f6f7f7;">%s</div>',
			esc_html__( 'Domestique is being set up. Please check back in a moment.', 'domestique' )
		);
	}

	private function wp_login_notice(): string {
		$login_url = wp_login_url( $this->current_url() );
		return sprintf(
			'<div class="sbe-notice" style="padding:1rem;border:1px solid #ddd;border-radius:.5rem;background:#f6f7f7;">%s <a href="%s">%s</a></div>',
			esc_html__( 'You need to be logged in to use Domestique.', 'domestique' ),
			esc_url( $login_url ),
			esc_html__( 'Log in', 'domestique' )
		);
	}

	private function not_configured_notice(): string {
		if ( current_user_can( 'manage_options' ) ) {
			return sprintf(
				'<div class="sbe-notice" style="padding:1rem;border:1px solid #f0b849;border-radius:.5rem;background:#fdf7e7;">%s <a href="%s">%s</a></div>',
				esc_html__( 'Domestique is not configured yet.', 'domestique' ),
				esc_url( admin_url( 'options-general.php?page=domestique' ) ),
				esc_html__( 'Open settings', 'domestique' )
			);
		}
		return sprintf(
			'<div class="sbe-notice" style="padding:1rem;border:1px solid #ddd;border-radius:.5rem;background:#f6f7f7;">%s</div>',
			esc_html__( 'Domestique is not configured yet. Ask the site administrator to set it up.', 'domestique' )
		);
	}

	private function current_url(): string {
		$scheme = is_ssl() ? 'https' : 'http';
		$host   = $_SERVER['HTTP_HOST'] ?? wp_parse_url( home_url(), PHP_URL_HOST );
		$uri    = $_SERVER['REQUEST_URI'] ?? '/';
		return $scheme . '://' . $host . $uri;
	}
}
