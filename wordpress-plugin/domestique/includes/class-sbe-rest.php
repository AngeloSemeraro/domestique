<?php
/**
 * REST API endpoints that the bundled React app talks to. All routes are
 * authenticated to the current WordPress user; their Strava token comes from
 * SBE_Token_Store.
 *
 * Phase-3 / phase-4 implementation. Phase 1 registers placeholders so the
 * routes exist; full Strava proxy lands when the React bundle is wired in.
 *
 * @package Domestique
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_REST {

	private static ?SBE_REST $instance = null;
	public static function instance(): SBE_REST {
		return self::$instance ?? ( self::$instance = new self() );
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		$auth = array( SBE_OAuth::instance(), 'require_logged_in' );

		register_rest_route(
			'sbe/v1',
			'/activities',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'list_activities' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/activities/batch',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'batch_update' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/streams/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'streams' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/uploads',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'upload' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/uploads/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'upload_status' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stats' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			'sbe/v1',
			'/geocode',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'geocode' ),
				'permission_callback' => $auth,
			)
		);
	}

	public function list_activities( WP_REST_Request $req ) {
		$uid    = get_current_user_id();
		$params = array( 'per_page' => 100 );
		foreach ( array( 'before', 'after', 'page' ) as $k ) {
			$v = $req->get_param( $k );
			if ( $v !== null && $v !== '' ) {
				$params[ $k ] = (int) $v;
			}
		}
		$res = SBE_Strava_Client::get( $uid, '/athlete/activities', $params );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return new WP_REST_Response( array( 'activities' => $res ), 200 );
	}

	public function batch_update( WP_REST_Request $req ): WP_REST_Response|WP_Error {
		$uid     = get_current_user_id();
		$body    = $req->get_json_params();
		$queue   = array();
		if ( is_array( $body['updates'] ?? null ) ) {
			foreach ( $body['updates'] as $u ) {
				if ( isset( $u['id'], $u['update'] ) && is_array( $u['update'] ) && ! empty( $u['update'] ) ) {
					$queue[] = array( 'id' => (int) $u['id'], 'update' => $u['update'] );
				}
			}
		} elseif ( is_array( $body['ids'] ?? null ) && is_array( $body['update'] ?? null ) && ! empty( $body['update'] ) ) {
			foreach ( $body['ids'] as $id ) {
				$queue[] = array( 'id' => (int) $id, 'update' => $body['update'] );
			}
		}
		if ( empty( $queue ) ) {
			return new WP_Error( 'sbe_bad_request', 'ids+update or updates[] required', array( 'status' => 400 ) );
		}

		$results = array();
		foreach ( $queue as $item ) {
			$resp = SBE_Strava_Client::put( $uid, '/activities/' . $item['id'], $item['update'] );
			if ( is_wp_error( $resp ) ) {
				$status = $resp->get_error_data()['status'] ?? 500;
				$results[] = array( 'id' => $item['id'], 'ok' => false, 'error' => $status . ': ' . $resp->get_error_message() );
				if ( (int) $status === 429 ) {
					break; // rate-limited; stop
				}
			} else {
				$results[] = array( 'id' => $item['id'], 'ok' => true );
			}
			usleep( 250000 ); // 250 ms throttle, matches the Next.js version
		}
		return new WP_REST_Response( array( 'results' => $results ), 200 );
	}

	public function streams( WP_REST_Request $req ) {
		$uid = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$res = SBE_Strava_Client::get(
			$uid,
			"/activities/$id/streams",
			array(
				'keys'        => 'latlng,time,altitude,heartrate,cadence',
				'key_by_type' => 'true',
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return new WP_REST_Response( $res, 200 );
	}

	public function upload( WP_REST_Request $req ): WP_REST_Response|WP_Error {
		$uid       = get_current_user_id();
		$body      = $req->get_json_params();
		$content   = isset( $body['data'] ) ? (string) $body['data'] : ( isset( $body['gpx'] ) ? (string) $body['gpx'] : '' );
		$data_type = isset( $body['dataType'] ) ? (string) $body['dataType'] : 'gpx';
		if ( $content === '' || empty( $body['name'] ) ) {
			return new WP_Error( 'sbe_bad_request', 'file content and name required', array( 'status' => 400 ) );
		}
		$meta = array( 'name' => (string) $body['name'] );
		foreach ( array( 'description', 'external_id' ) as $k ) {
			if ( ! empty( $body[ $k ] ) ) {
				$meta[ $k ] = (string) $body[ $k ];
			}
		}
		if ( ! empty( $body['trainer'] ) ) {
			$meta['trainer'] = '1';
		}
		if ( ! empty( $body['commute'] ) ) {
			$meta['commute'] = '1';
		}
		$res = SBE_Strava_Client::upload_file( $uid, $content, $data_type, $meta );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return new WP_REST_Response( $res, 200 );
	}

	public function upload_status( WP_REST_Request $req ) {
		$uid = get_current_user_id();
		$id  = (int) $req->get_param( 'id' );
		$res = SBE_Strava_Client::get( $uid, "/uploads/$id" );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return new WP_REST_Response( $res, 200 );
	}

	public function stats(): WP_REST_Response|WP_Error {
		$uid = get_current_user_id();
		$ath = SBE_Strava_Client::get( $uid, '/athlete' );
		if ( is_wp_error( $ath ) ) {
			return $ath;
		}
		$id = (int) ( $ath['id'] ?? 0 );
		if ( ! $id ) {
			return new WP_Error( 'sbe_no_athlete', 'No athlete id', array( 'status' => 401 ) );
		}
		$stats = SBE_Strava_Client::get( $uid, "/athletes/$id/stats" );
		if ( is_wp_error( $stats ) ) {
			return $stats;
		}
		return new WP_REST_Response( $stats, 200 );
	}

	public function geocode( WP_REST_Request $req ): WP_REST_Response|WP_Error {
		$lat = (string) $req->get_param( 'lat' );
		$lng = (string) $req->get_param( 'lng' );
		if ( $lat === '' || $lng === '' ) {
			return new WP_Error( 'sbe_bad_request', 'lat/lng required', array( 'status' => 400 ) );
		}
		$url = 'https://nominatim.openstreetmap.org/reverse?' . http_build_query(
			array(
				'lat'            => $lat,
				'lon'            => $lng,
				'format'         => 'json',
				'zoom'           => 10,
				'addressdetails' => 1,
			)
		);
		$res = wp_remote_get(
			$url,
			array(
				'timeout' => 10,
				'headers' => array(
					'User-Agent'      => 'domestique-wp/' . SBE_VERSION . ' (' . home_url( '/' ) . ')',
					'Accept-Language' => get_locale() ? substr( get_locale(), 0, 2 ) : 'en',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		$a    = is_array( $data ) && isset( $data['address'] ) ? $data['address'] : array();
		return new WP_REST_Response(
			array(
				'city'    => $a['city'] ?? $a['town'] ?? $a['village'] ?? $a['hamlet'] ?? $a['municipality'] ?? $a['county'] ?? null,
				'state'   => $a['state'] ?? $a['region'] ?? null,
				'country' => $a['country'] ?? null,
			),
			200
		);
	}
}
