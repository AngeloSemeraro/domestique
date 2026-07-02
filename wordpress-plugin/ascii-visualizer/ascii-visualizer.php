<?php
/**
 * Plugin Name:       ASCII Visualizer
 * Plugin URI:        https://github.com/AngeloSemeraro/ASCII-Visualizer
 * Description:        Real-time ASCII art filter for the webcam. Drop it into any page with the [ascii_visualizer] shortcode.
 * Version:           0.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Angelo Semeraro
 * License:           MIT
 * Text Domain:       ascii-visualizer
 *
 * Note: camera access (getUserMedia) requires the page to be served over HTTPS.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'ASCIIV_VERSION', '0.1.0' );
define( 'ASCIIV_URL', plugin_dir_url( __FILE__ ) );
define( 'ASCIIV_PATH', plugin_dir_path( __FILE__ ) );

/**
 * Register the widget script. It is only actually enqueued when a page uses the
 * shortcode (see asciiv_shortcode).
 */
function asciiv_register_assets() {
	wp_register_script(
		'ascii-visualizer',
		ASCIIV_URL . 'assets/ascii-visualizer.js',
		array(),
		ASCIIV_VERSION,
		true // in footer
	);
}
add_action( 'wp_enqueue_scripts', 'asciiv_register_assets' );

/**
 * [ascii_visualizer] shortcode.
 *
 * Attributes (all optional):
 *   columns    (int)     characters across, default 110
 *   color      (string)  color | mono | inverted, default "color"
 *   preset     (string)  standard | detailed | blocks | minimal | binary
 *   controls   (bool)    show the control panel, default "true"
 *   autostart  (bool)    request the camera immediately, default "false"
 *   background (string)  CSS color for the canvas background
 *   foreground (string)  CSS color for mono / inverted characters
 *   height     (string)  CSS height for the widget, default "auto"
 *   maxwidth   (string)  CSS max-width, default "960px"
 */
function asciiv_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'columns'    => '110',
			'color'      => 'color',
			'preset'     => 'standard',
			'controls'   => 'true',
			'autostart'  => 'false',
			'background' => '',
			'foreground' => '',
			'height'     => 'auto',
			'maxwidth'   => '960px',
		),
		$atts,
		'ascii_visualizer'
	);

	wp_enqueue_script( 'ascii-visualizer' );

	$style = sprintf(
		'max-width:%s;height:%s;',
		esc_attr( $atts['maxwidth'] ),
		esc_attr( $atts['height'] )
	);

	$data = array(
		'data-ascii-visualizer' => '',
		'data-columns'          => intval( $atts['columns'] ),
		'data-color-mode'       => sanitize_text_field( $atts['color'] ),
		'data-preset'           => sanitize_text_field( $atts['preset'] ),
		'data-controls'         => 'false' === $atts['controls'] ? 'false' : 'true',
		'data-autostart'        => 'true' === $atts['autostart'] ? 'true' : 'false',
	);

	if ( ! empty( $atts['background'] ) ) {
		$data['data-background'] = sanitize_text_field( $atts['background'] );
	}
	if ( ! empty( $atts['foreground'] ) ) {
		$data['data-foreground'] = sanitize_text_field( $atts['foreground'] );
	}

	$attr_str = '';
	foreach ( $data as $key => $value ) {
		$attr_str .= sprintf( ' %s="%s"', esc_attr( $key ), esc_attr( $value ) );
	}

	return sprintf( '<div class="asciiv-embed" style="%s"%s></div>', esc_attr( $style ), $attr_str );
}
add_shortcode( 'ascii_visualizer', 'asciiv_shortcode' );
