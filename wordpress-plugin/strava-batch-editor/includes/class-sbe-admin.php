<?php
/**
 * wp-admin settings page where the site owner pastes their Strava
 * Client ID / Client Secret. One-time setup per site.
 *
 * @package StravaBatchEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_Admin {

	private static ?SBE_Admin $instance = null;
	public static function instance(): SBE_Admin {
		return self::$instance ?? ( self::$instance = new self() );
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	public function add_menu(): void {
		add_options_page(
			__( 'Strava Batch Editor', 'strava-batch-editor' ),
			__( 'Strava Batch Editor', 'strava-batch-editor' ),
			'manage_options',
			'strava-batch-editor',
			array( $this, 'render_page' )
		);
	}

	public function register_settings(): void {
		register_setting(
			'sbe_settings_group',
			SBE_OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	public function sanitize( $input ): array {
		$out = array();
		if ( is_array( $input ) ) {
			$out['client_id']     = isset( $input['client_id'] ) ? sanitize_text_field( $input['client_id'] ) : '';
			$out['client_secret'] = isset( $input['client_secret'] ) ? sanitize_text_field( $input['client_secret'] ) : '';
		}
		return $out;
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings     = SBE_Plugin::get_settings();
		$redirect_uri = esc_url( SBE_Plugin::oauth_redirect_uri() );
		$host         = wp_parse_url( home_url(), PHP_URL_HOST );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Strava Batch Editor', 'strava-batch-editor' ); ?></h1>

			<div style="background:#fff;border:1px solid #ccd0d4;padding:16px;margin:16px 0;max-width:780px;">
				<h2 style="margin-top:0"><?php esc_html_e( 'One-time setup', 'strava-batch-editor' ); ?></h2>
				<ol>
					<li>
						<?php
						printf(
							/* translators: %s: link to Strava API portal */
							wp_kses_post( __( 'Open the %s.', 'strava-batch-editor' ) ),
							'<a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">Strava API portal</a>'
						);
						?>
					</li>
					<li><?php esc_html_e( 'Click "Create & Manage Your App" and fill in the form. Category: Other.', 'strava-batch-editor' ); ?></li>
					<li>
						<?php esc_html_e( 'Set the Authorization Callback Domain to:', 'strava-batch-editor' ); ?>
						<code><?php echo esc_html( $host ); ?></code>
					</li>
					<li><?php esc_html_e( 'After saving, copy the Client ID and Client Secret here below.', 'strava-batch-editor' ); ?></li>
				</ol>
				<p>
					<strong><?php esc_html_e( 'Redirect URI for reference:', 'strava-batch-editor' ); ?></strong><br>
					<code><?php echo esc_html( $redirect_uri ); ?></code>
				</p>
			</div>

			<form method="post" action="options.php" style="max-width:780px;">
				<?php settings_fields( 'sbe_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row">
								<label for="sbe_client_id"><?php esc_html_e( 'Strava Client ID', 'strava-batch-editor' ); ?></label>
							</th>
							<td>
								<input
									type="text"
									id="sbe_client_id"
									name="<?php echo esc_attr( SBE_OPTION_KEY ); ?>[client_id]"
									value="<?php echo esc_attr( $settings['client_id'] ); ?>"
									class="regular-text code"
									autocomplete="off"
								/>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label for="sbe_client_secret"><?php esc_html_e( 'Strava Client Secret', 'strava-batch-editor' ); ?></label>
							</th>
							<td>
								<input
									type="password"
									id="sbe_client_secret"
									name="<?php echo esc_attr( SBE_OPTION_KEY ); ?>[client_secret]"
									value="<?php echo esc_attr( $settings['client_secret'] ); ?>"
									class="regular-text code"
									autocomplete="off"
								/>
								<p class="description">
									<?php esc_html_e( 'Stored in the wp_options table and never sent anywhere except to Strava.', 'strava-batch-editor' ); ?>
								</p>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>

			<div style="background:#fff;border:1px solid #ccd0d4;padding:16px;margin:16px 0;max-width:780px;">
				<h2 style="margin-top:0"><?php esc_html_e( 'Use it on any page', 'strava-batch-editor' ); ?></h2>
				<p><?php esc_html_e( 'Drop one of these shortcodes into any page or post:', 'strava-batch-editor' ); ?></p>
				<ul>
					<li><code>[strava_batch_editor]</code> — <?php esc_html_e( 'full app (all three tabs)', 'strava-batch-editor' ); ?></li>
					<li><code>[strava_batch_editor tab="edit"]</code> — <?php esc_html_e( 'Batch edit only', 'strava-batch-editor' ); ?></li>
					<li><code>[strava_batch_editor tab="merge"]</code> — <?php esc_html_e( 'Merge rides only', 'strava-batch-editor' ); ?></li>
					<li><code>[strava_batch_editor tab="inspector"]</code> — <?php esc_html_e( 'Inspector only', 'strava-batch-editor' ); ?></li>
					<li><code>[strava_batch_editor_login]</code> — <?php esc_html_e( 'just the Connect with Strava button', 'strava-batch-editor' ); ?></li>
				</ul>
				<p>
					<?php esc_html_e( 'Each logged-in WordPress user connects their own Strava account.', 'strava-batch-editor' ); ?>
				</p>
			</div>
		</div>
		<?php
	}
}
