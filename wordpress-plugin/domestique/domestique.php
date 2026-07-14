<?php
/**
 * Plugin Name:       Domestique
 * Plugin URI:        https://github.com/AngeloSemeraro/domestique
 * Description:       The domestique for your Strava rides: batch edit, merge, inspect and export them from any WordPress page via shortcode. Each user connects their own Strava account.
 * Version:           0.6.1
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Angelo Semeraro
 * Author URI:        https://github.com/AngeloSemeraro
 * License:           GPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain:       domestique
 * Domain Path:       /languages
 *
 * @package Domestique
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SBE_VERSION', '0.6.1' );
define( 'SBE_PLUGIN_FILE', __FILE__ );
define( 'SBE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SBE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'SBE_OPTION_KEY', 'sbe_settings' );

require_once SBE_PLUGIN_DIR . 'includes/class-sbe-token-store.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-strava-client.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-rwgps.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-admin.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-oauth.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-rest.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-shortcode.php';
require_once SBE_PLUGIN_DIR . 'includes/class-sbe-plugin.php';

SBE_Plugin::instance()->init();
