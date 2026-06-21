# Strava Batch Editor — WordPress plugin

Self-contained WordPress plugin that brings the Strava Batch Editor into any
page via shortcodes. Lives alongside the Next.js app in this repo so the two
implementations can share `src/lib/gpx.ts` and `src/lib/file-parsers.ts` for
the heavy lifting; only the backend / glue is rewritten in PHP.

```
wordpress-plugin/
  strava-batch-editor/      ← this is the plugin folder you zip and install
    strava-batch-editor.php
    readme.txt
    LICENSE
    includes/*.php
    assets/                 ← icon, built JS/CSS bundle (phase 4)
    languages/              ← i18n .pot
  src/                      ← React entry for the WP bundle (phase 4)
  vite.config.ts            ← (phase 4)
  package.json              ← (phase 4)
```

## Build status

| Phase | What | Status |
|---|---|---|
| 1 | PHP scaffold: plugin file, admin page, OAuth, REST proxy, shortcodes (placeholder mount) | ✅ |
| 2 | Strava OAuth flow live + token refresh | ✅ (in phase 1) |
| 3 | Strava REST proxy (activities / streams / uploads / geocode) | ✅ (in phase 1) |
| 4 | React bundle build (Vite) wired to WP REST endpoints | ✅ |
| 5 | i18n .pot, screenshots, WP.org submission package | ⏳ |

Phases 2 and 3 landed inside the same scaffold pass because the PHP side is
small enough that splitting it added no value.

## Building the React bundle

The bundle reuses the same React components and `src/lib/*` as the Next.js
app — only the API base URL and auth header differ (handled by
`src/lib/api.ts`, which detects `window.SBE_BOOTSTRAP`).

```bash
cd wordpress-plugin
npm install
npm run build       # writes strava-batch-editor/assets/js/app.iife.js
                    # and strava-batch-editor/assets/css/app.css
```

`npm run dev` watches for changes during development. The plugin enqueues
both files only on pages that actually contain a shortcode, so they don't
load on the rest of the site.

## Install (developer mode)

While phase 4 isn't done, the plugin loads and the admin / OAuth / REST work,
but the shortcode renders an empty mount point (the React bundle isn't built
yet). To test the PHP layer:

1. Symlink or copy `wordpress-plugin/strava-batch-editor/` into a WordPress
   install: `wp-content/plugins/strava-batch-editor/`.
2. Activate the plugin in **Plugins**.
3. **Settings → Strava Batch Editor**: paste Client ID / Client Secret from
   your Strava API app (Authorization Callback Domain = the site's host).
4. Add `[strava_batch_editor]` to a page — visit it as a logged-in user.
5. The Connect button works:
   `your-site.com/wp-json/sbe/v1/auth/login?return=…`.

## REST endpoints (the React bundle will call these)

All require the user to be logged into WordPress; tokens are per-user.

```
GET  /wp-json/sbe/v1/me                   { authenticated, athlete? }
GET  /wp-json/sbe/v1/auth/login           302 → Strava authorize
GET  /wp-json/sbe/v1/auth/callback        302 → return URL with sbe_connected=1
POST /wp-json/sbe/v1/auth/logout          { ok: true }
POST /wp-json/sbe/v1/auth/revoke          { ok: true, revoked: bool }
GET  /wp-json/sbe/v1/activities?after=&before=&page=
POST /wp-json/sbe/v1/activities/batch     { ids+update | updates[] } → { results }
GET  /wp-json/sbe/v1/streams/{id}
POST /wp-json/sbe/v1/uploads              { data, dataType, name, … }
GET  /wp-json/sbe/v1/uploads/{id}
GET  /wp-json/sbe/v1/geocode?lat=&lng=    { city, state, country }
```

## License

GPLv3, same as the parent project.
