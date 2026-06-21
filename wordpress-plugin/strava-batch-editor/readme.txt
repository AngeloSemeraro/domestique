=== Strava Batch Editor ===
Contributors: angelosemeraro
Tags: strava, cycling, gpx, tcx, fit, batch edit, merge
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Edit, merge and clean up your Strava rides in bulk — right inside any WordPress page via shortcode. Each user connects their own Strava account.

== Description ==

Strava Batch Editor brings the open-source [Strava Batch Editor](https://github.com/AngeloSemeraro/strava_batch_editor) into WordPress as a plugin you can drop onto any page or post.

Three tools in one:

* **Batch edit** — rename, change sport type, gear, hide-from-feed, trainer, commute on many activities at once.
* **Merge rides** — combine multiple rides (Strava activities and/or local `.gpx` / `.fit` files) into one new activity, with movement filtering that drops train/car stretches.
* **Inspector** — load a single `.gpx` / `.fit`, tune the movement filter live with kept/dropped charts, then publish or download.

Outputs both **TCX** (recommended for Strava — carries the real distance odometer that skips unrecorded transfers) and **GPX**.

= How users access it =

The site administrator pastes their Strava API Client ID / Client Secret once in **Settings → Strava Batch Editor**.

Drop a shortcode on any page or post:

* `[strava_batch_editor]` — full app
* `[strava_batch_editor tab="edit"]` — Batch edit only
* `[strava_batch_editor tab="merge"]` — Merge rides only
* `[strava_batch_editor tab="inspector"]` — Inspector only
* `[strava_batch_editor_login]` — just the Connect with Strava button

Every logged-in WordPress user clicks **Connect with Strava** to authorize their *own* account. Tokens are stored in their user meta and never shared between users.

= Privacy =

Tokens go from the user's browser, through this WordPress site, to Strava — nowhere else. Reverse geocoding for activity locations uses OpenStreetMap's Nominatim service.

== External services ==

This plugin calls the following external services on behalf of the logged-in user:

* **Strava API** (`https://www.strava.com/api/v3/*`, `https://www.strava.com/oauth/*`) — to read and write the user's own activities. Required. [Terms](https://www.strava.com/legal/api). [Privacy](https://www.strava.com/legal/privacy).
* **Nominatim / OpenStreetMap** (`https://nominatim.openstreetmap.org/reverse`) — to look up the country/city of activities whose location wasn't recorded. Sends only the start latitude/longitude. [Usage policy](https://operations.osmfoundation.org/policies/nominatim/).

== Installation ==

1. Upload `strava-batch-editor` to the `/wp-content/plugins/` directory, or install via the Plugins screen.
2. Activate it.
3. Go to **Settings → Strava Batch Editor** and follow the on-screen steps to create a free Strava API app and paste the Client ID / Client Secret.
4. Add `[strava_batch_editor]` to any page.

== Frequently Asked Questions ==

= Do my users need their own Strava API app? =

No. The administrator registers one Strava API app for the site. Each user just clicks "Connect with Strava" and authorizes that app for their own account.

= What about the daily Strava rate limit? =

Strava limits API requests per app. If many users use the plugin heavily on the same day they can collectively hit that limit. For personal or small-club use it's typically fine.

= My uploaded merge shows the wrong distance =

Use the **TCX** output (default in the plugin) — it carries the real distance, so Strava doesn't recompute and inflate it from GPS points across unrecorded transfers between source rides.

== Changelog ==

= 0.1.0 =
* Initial release: OAuth, settings page, REST proxy, shortcodes, React bundle.

== Upgrade Notice ==

= 0.1.0 =
First release.
