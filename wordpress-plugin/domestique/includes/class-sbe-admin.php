<?php
/**
 * wp-admin settings page where the site owner pastes their Strava
 * Client ID / Client Secret. One-time setup per site.
 *
 * @package Domestique
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
		// Top-level menu (its own item in the admin sidebar), not buried
		// under Settings. Uses a bike dashicon.
		add_menu_page(
			__( 'Domestique', 'domestique' ),
			__( 'Domestique', 'domestique' ),
			'manage_options',
			'domestique',
			array( $this, 'render_page' ),
			'dashicons-bike',
			58 // just below Plugins
		);
		// Give the submenu a friendlier label than the repeated menu title.
		add_submenu_page(
			'domestique',
			__( 'Domestique settings', 'domestique' ),
			__( 'Settings', 'domestique' ),
			'manage_options',
			'domestique',
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
			$out['client_id']           = isset( $input['client_id'] ) ? sanitize_text_field( $input['client_id'] ) : '';
			$out['client_secret']       = isset( $input['client_secret'] ) ? sanitize_text_field( $input['client_secret'] ) : '';
			$out['rwgps_client_id']     = isset( $input['rwgps_client_id'] ) ? sanitize_text_field( $input['rwgps_client_id'] ) : '';
			$out['rwgps_client_secret'] = isset( $input['rwgps_client_secret'] ) ? sanitize_text_field( $input['rwgps_client_secret'] ) : '';
			$out['rwgps_api_key']       = isset( $input['rwgps_api_key'] ) ? sanitize_text_field( $input['rwgps_api_key'] ) : '';
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
			<h1><?php esc_html_e( 'Domestique', 'domestique' ); ?></h1>

			<div style="background:#fff;border:1px solid #ccd0d4;padding:16px;margin:16px 0;max-width:780px;">
				<h2 style="margin-top:0"><?php esc_html_e( 'One-time setup', 'domestique' ); ?></h2>
				<ol>
					<li>
						<?php
						printf(
							/* translators: %s: link to Strava API portal */
							wp_kses_post( __( 'Open the %s.', 'domestique' ) ),
							'<a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">Strava API portal</a>'
						);
						?>
					</li>
					<li><?php esc_html_e( 'Click "Create & Manage Your App" and fill in the form. Category: Other.', 'domestique' ); ?></li>
					<li>
						<?php esc_html_e( 'Set the Authorization Callback Domain to:', 'domestique' ); ?>
						<code><?php echo esc_html( $host ); ?></code>
					</li>
					<li><?php esc_html_e( 'After saving, copy the Client ID and Client Secret here below.', 'domestique' ); ?></li>
				</ol>
				<p>
					<strong><?php esc_html_e( 'Redirect URI for reference:', 'domestique' ); ?></strong><br>
					<code><?php echo esc_html( $redirect_uri ); ?></code>
				</p>
			</div>

			<form method="post" action="options.php" style="max-width:780px;">
				<?php settings_fields( 'sbe_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row">
								<label for="sbe_client_id"><?php esc_html_e( 'Strava Client ID', 'domestique' ); ?></label>
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
								<label for="sbe_client_secret"><?php esc_html_e( 'Strava Client Secret', 'domestique' ); ?></label>
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
									<?php esc_html_e( 'Stored in the wp_options table and never sent anywhere except to Strava.', 'domestique' ); ?>
								</p>
							</td>
						</tr>
						<tr>
							<th scope="row" colspan="2" style="padding-bottom:0;">
								<h2 style="margin:1.5em 0 0;"><?php esc_html_e( 'RideWithGPS (optional)', 'domestique' ); ?></h2>
								<p style="font-weight:normal;max-width:620px;">
									<?php esc_html_e( 'Lets each user upload their selected activities straight to their own RideWithGPS library from the Batch edit tab. Leave blank to hide the feature — the GPX/FIT downloads work without it.', 'domestique' ); ?>
								</p>
								<ol style="font-weight:normal;max-width:620px;">
									<li>
										<?php
										printf(
											/* translators: %s: link to the RideWithGPS API page */
											wp_kses_post( __( 'Sign in at %s and open your account settings.', 'domestique' ) ),
											'<a href="https://ridewithgps.com/api" target="_blank" rel="noreferrer">ridewithgps.com/api</a>'
										);
										?>
									</li>
									<li><?php echo wp_kses_post( __( 'Go to the <strong>Developers</strong> tab and create a new <strong>API client</strong> (application).', 'domestique' ) ); ?></li>
									<li>
										<?php echo wp_kses_post( __( 'Set its <strong>Redirect URI</strong> (callback URL) to exactly:', 'domestique' ) ); ?>
										<br><code style="user-select:all;"><?php echo esc_html( SBE_RWGPS::redirect_uri() ); ?></code>
									</li>
									<li><?php echo wp_kses_post( __( 'Save, then copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the fields below.', 'domestique' ) ); ?></li>
								</ol>
							</th>
						</tr>
						<tr>
							<th scope="row">
								<label for="sbe_rwgps_client_id"><?php esc_html_e( 'RideWithGPS Client ID', 'domestique' ); ?></label>
							</th>
							<td>
								<input
									type="text"
									id="sbe_rwgps_client_id"
									name="<?php echo esc_attr( SBE_OPTION_KEY ); ?>[rwgps_client_id]"
									value="<?php echo esc_attr( $settings['rwgps_client_id'] ); ?>"
									class="regular-text code"
									autocomplete="off"
								/>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label for="sbe_rwgps_client_secret"><?php esc_html_e( 'RideWithGPS Client Secret', 'domestique' ); ?></label>
							</th>
							<td>
								<input
									type="password"
									id="sbe_rwgps_client_secret"
									name="<?php echo esc_attr( SBE_OPTION_KEY ); ?>[rwgps_client_secret]"
									value="<?php echo esc_attr( $settings['rwgps_client_secret'] ); ?>"
									class="regular-text code"
									autocomplete="off"
								/>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label for="sbe_rwgps_api_key"><?php esc_html_e( 'RideWithGPS API key', 'domestique' ); ?></label>
							</th>
							<td>
								<input
									type="text"
									id="sbe_rwgps_api_key"
									name="<?php echo esc_attr( SBE_OPTION_KEY ); ?>[rwgps_api_key]"
									value="<?php echo esc_attr( $settings['rwgps_api_key'] ); ?>"
									class="regular-text code"
									autocomplete="off"
								/>
								<p class="description">
									<?php esc_html_e( 'Almost always leave this empty — RideWithGPS uses the Client ID as the API key. Fill it only if your API client shows a separate key.', 'domestique' ); ?>
								</p>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button(); ?>
			</form>

			<div style="background:#fff;border:1px solid #ccd0d4;padding:16px;margin:16px 0;max-width:780px;">
				<h2 style="margin-top:0"><?php esc_html_e( 'Use it on any page', 'domestique' ); ?></h2>
				<p><?php esc_html_e( 'Drop one of these shortcodes into any page or post:', 'domestique' ); ?></p>
				<ul>
					<li><code>[domestique]</code> — <?php esc_html_e( 'full app (all three tabs)', 'domestique' ); ?></li>
					<li><code>[domestique tab="edit"]</code> — <?php esc_html_e( 'Batch edit only', 'domestique' ); ?></li>
					<li><code>[domestique tab="merge"]</code> — <?php esc_html_e( 'Merge rides only', 'domestique' ); ?></li>
					<li><code>[domestique tab="inspector"]</code> — <?php esc_html_e( 'Inspector only', 'domestique' ); ?></li>
					<li><code>[domestique_login]</code> — <?php esc_html_e( 'just the Connect with Strava button', 'domestique' ); ?></li>
				</ul>
				<p>
					<?php esc_html_e( 'Each logged-in WordPress user connects their own Strava account.', 'domestique' ); ?>
				</p>
			</div>
		</div>
		<?php
	}
}
