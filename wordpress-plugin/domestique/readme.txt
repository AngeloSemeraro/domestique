=== Domestique ===
Contributors: angelosemeraro
Tags: strava, cycling, gpx, tcx, fit, batch edit, merge
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.6.1
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

The domestique for your Strava rides: batch edit, merge, inspect and export them in bulk — right inside any WordPress page via shortcode. Each user connects their own Strava account.

== Description ==

Domestique brings the open-source [Domestique](https://github.com/AngeloSemeraro/domestique) into WordPress as a plugin you can drop onto any page or post.

Three tools in one:

* **Batch edit** — rename, change sport type, gear, hide-from-feed, trainer, commute on many activities at once. The activities list has **Strava rides and Local files tabs**; the **Send / export** section uploads the selection to your **RideWithGPS** library (optional OAuth integration) or downloads it as a **GPX or FIT zip** — handy for importing into Komoot (no public upload API) via its multi-file upload page.
* **Merge rides** — combine multiple rides (Strava activities and/or local `.gpx` / `.fit` files) into one new activity, with movement filtering that drops train/car stretches.
* **Inspector** — pick one of your Strava rides or load a single `.gpx` / `.fit` and explore it on an interactive map with togglable waypoints, plus a detailed elevation profile colored by gradient (Wahoo ELEMNT-style bands). Hover is mirrored between the profile and the map; drag a range (or scroll) on the profile to zoom in, audio-editor style, and the map follows. Tune the movement filter live with kept/dropped charts, then publish or download. Files without timestamps (route exports) load fine — times are synthesized automatically.

Outputs both **TCX** (recommended for Strava — carries the real distance odometer that skips unrecorded transfers) and **GPX**.

= How users access it =

The site administrator pastes their Strava API Client ID / Client Secret once in **Domestique → Settings**.

Drop a shortcode on any page or post:

* `[domestique]` — full app
* `[domestique tab="edit"]` — Batch edit only
* `[domestique tab="merge"]` — Merge rides only
* `[domestique tab="inspector"]` — Inspector only
* `[domestique_login]` — just the Connect with Strava button

Every logged-in WordPress user clicks **Connect with Strava** to authorize their *own* account. Tokens are stored in their user meta and never shared between users.

= Privacy =

Tokens go from the user's browser, through this WordPress site, to Strava — nowhere else. Reverse geocoding for activity locations uses OpenStreetMap's Nominatim service.

== External services ==

This plugin calls the following external services on behalf of the logged-in user:

* **Strava API** (`https://www.strava.com/api/v3/*`, `https://www.strava.com/oauth/*`) — to read and write the user's own activities. Required. [Terms](https://www.strava.com/legal/api). [Privacy](https://www.strava.com/legal/privacy).
* **Nominatim / OpenStreetMap** (`https://nominatim.openstreetmap.org/reverse`) — to look up the country/city of activities whose location wasn't recorded. Sends only the start latitude/longitude. [Usage policy](https://operations.osmfoundation.org/policies/nominatim/).
* **OpenStreetMap tile server** (`https://tile.openstreetmap.org/*`) — the Inspector's interactive map loads its background tiles from here, directly from the visitor's browser. The tile server sees the map area being viewed (as tile coordinates) and the visitor's IP, like any embedded map. [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
* **RideWithGPS API** (`https://ridewithgps.com/oauth/*`, `https://ridewithgps.com/api/v1/*`, `https://ridewithgps.com/trips.json`) — only when the administrator configures the optional RideWithGPS integration and a user connects their own RideWithGPS account. Used to upload the user's selected activities as trips to their own RideWithGPS library. [Terms](https://ridewithgps.com/terms). [Privacy](https://ridewithgps.com/privacy).

== Installation ==

1. Upload `domestique` to the `/wp-content/plugins/` directory, or install via the Plugins screen.
2. Activate it.
3. Go to **Domestique → Settings** and follow the on-screen steps to create a free Strava API app and paste the Client ID / Client Secret.
4. Add `[domestique]` to any page.

== Frequently Asked Questions ==

= Do my users need their own Strava API app? =

No. The administrator registers one Strava API app for the site. Each user just clicks "Connect with Strava" and authorizes that app for their own account.

= What about the daily Strava rate limit? =

Strava limits API requests per app. If many users use the plugin heavily on the same day they can collectively hit that limit. For personal or small-club use it's typically fine.

= My uploaded merge shows the wrong distance =

Use the **TCX** output (default in the plugin) — it carries the real distance, so Strava doesn't recompute and inflate it from GPS points across unrecorded transfers between source rides.

= Can it upload to Komoot too? =

No — Komoot has no public API and third-party integrations require a partner agreement with them, so direct upload isn't possible without breaking their terms. The "Upload to Komoot" button explains this; use **Download GPX/FIT (zip)** and drop all the files onto komoot.com/upload in one go instead.

== Vibe coded with Claude ==

This whole thing was vibe coded using Claude Code. I'm not a developer and I don't read the code — I described what I wanted, tested the result in the browser, and shipped what worked. You should know what you're installing: this is AI-generated software, maintained by one person in their spare time who can't debug it line by line.

== As-is, no support ==

Provided **as is**, with no warranty of any kind (see GPLv3 sections 15-16 for the legal text). In plain English:

* **No guaranteed updates.** If Strava changes its API, this plugin may break. There's no roadmap and no release schedule.
* **No support channel.** There's no help desk, no email, no Discord. Bug reports and pull requests on [GitHub Issues](https://github.com/AngeloSemeraro/domestique/issues) are welcome but will be looked at when (and if) time allows — and any fix will most likely be vibe coded too.
* **Use at your own risk.** It only writes to *your* Strava account using *your* API credentials, so the blast radius is your own data — but please review what a bulk edit does on a small selection before hitting "Apply" to 500 activities.
* **Fork it.** It's GPLv3 — if you need a fix and nobody's coming, clone the repo (or point your own AI at it) and change it yourself. That's the whole point of free software.

Not affiliated with Strava, Inc.

== Changelog ==

= 0.6.1 =
* Clearer RideWithGPS setup: you need the client's **OAuth** Client ID and Secret (turn on OAuth on the API client and set its Redirect URI), not the plain API key. Instructions and field labels updated.
* Custom bicycle-wheel icon for the Domestique admin menu.

= 0.6.0 =
* Plugin settings moved to a dedicated top-level **Domestique** menu in the WordPress admin (no longer buried under Settings).
* RideWithGPS connection is now managed in the app's **Preferences** (like Strava): connect, see the connected account, and disconnect there. The Batch edit export buttons are simpler.
* Clearer, step-by-step RideWithGPS setup instructions (Account Settings → Developers → create API client → Redirect URI).
* Standalone onboarding wizard gained an optional RideWithGPS step.

= 0.5.1 =
* Removed the legacy `[strava_batch_editor]` shortcode aliases entirely. Update any published pages to use `[domestique]` / `[domestique_login]`.

= 0.5.0 =
* Renamed to **Domestique** — a domestique does the hard work for the team; this plugin does it for your rides.
* New shortcodes `[domestique]` and `[domestique_login]`.
* Plugin folder and slug renamed to `domestique`: deactivate and **delete the old plugin**, then install this one. Settings and per-user Strava / RideWithGPS connections are preserved (they live in the database).

= 0.4.0 =
* All three tabs share one "sources" box with Strava rides / Local files tabs: batch-edit exports, merge sources and the Inspector all accept both.
* Batch edit: activities list moved above the edit/export cards; local files join Send / export.
* New **Download FIT (zip)** export (built-in FIT encoder) next to Download GPX.
* Explicit "Upload to Komoot" button (always disabled — Komoot has no public API; the tooltip explains the zip → komoot.com/upload flow).
* Inspector can open a Strava ride directly (streams fetched on pick).

= 0.3.0 =
* Batch edit tab: new "Send / export" section — export selected activities as GPX exactly as recorded.
* Optional RideWithGPS integration: each user connects their own RideWithGPS account (OAuth) and uploads selected activities to their library in batch. Admin configures the API client in the Domestique → Settings screen.
* Batch "Download GPX (zip)": all selected activities in one zip, for manual import into Komoot (no public API) or anywhere else.

= 0.2.0 =
* Inspector: interactive map (Leaflet + OpenStreetMap) with the track, start/end markers and togglable waypoints (GPX `<wpt>` / FIT course points).
* Inspector: detailed elevation profile colored by gradient using Wahoo ELEMNT-style bands (green 0-4%, yellow 4-8%, orange 8-12%, red 12-20%, brown 20%+).
* Inspector: hover on the elevation profile (or the map) shows distance / altitude / grade / elapsed time and is mirrored on the other view.
* Inspector: drag a range on the elevation profile to zoom into it, scroll to zoom, double-click to reset, drag the overview strip to pan — the map and the speed/HR/cadence charts follow the zoom window.
* Fixed: GPX/FIT files without timestamps (e.g. route exports) no longer fail to load — times are synthesized (1 s per point) so charts, downloads and Strava upload work.

= 0.1.0 =
* Initial release: OAuth, settings page, REST proxy, shortcodes, React bundle.

== Upgrade Notice ==

= 0.6.1 =
RideWithGPS setup wording corrected (OAuth Client ID/Secret) and a bike-wheel menu icon.

= 0.6.0 =
Settings now live under the new top-level "Domestique" admin menu; RideWithGPS connect/disconnect moved into the app's Preferences.

= 0.5.1 =
Legacy shortcodes removed: replace [strava_batch_editor] with [domestique] on your pages.

= 0.5.0 =
The plugin is now called Domestique. Delete the old "Strava Batch Editor" plugin first, then install this zip — settings and connections carry over, and the old shortcodes still work.

= 0.4.0 =
Unified Strava + local file sources in all tabs, FIT zip export, Batch edit layout rework. Rebuild the React bundle when updating from source.

= 0.3.0 =
Batch edit gets "Send / export": batch upload to RideWithGPS (optional, per-user OAuth) and batch GPX zip download. Rebuild the React bundle when updating from source.

= 0.2.0 =
Inspector gets an interactive map and a gradient-colored, zoomable elevation profile; GPX files without timestamps now load. Rebuild the React bundle (`cd wordpress-plugin && npm install && npm run build`) when updating from source.

= 0.1.0 =
First release.
