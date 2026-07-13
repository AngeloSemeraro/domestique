<?php
/**
 * Per-user Strava token storage. Tokens live in user_meta so each WordPress
 * user manages their own Strava connection independently.
 *
 * @package Domestique
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class SBE_Token_Store {

	private const META_KEY = '_sbe_strava_token';

	/**
	 * @return array{access_token?:string,refresh_token?:string,expires_at?:int,athlete?:array}|null
	 */
	public static function get( int $user_id ): ?array {
		$raw = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $raw ) ) {
			return null;
		}
		return $raw;
	}

	public static function save( int $user_id, array $token ): void {
		update_user_meta( $user_id, self::META_KEY, $token );
	}

	public static function clear( int $user_id ): void {
		delete_user_meta( $user_id, self::META_KEY );
	}
}
