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

## 🤖 Vibe coded with Claude

This whole thing was vibe coded using **Claude Code**. I'm not a
developer and I don't read the code — I described what I wanted,
tested the result in the browser, and shipped what worked. You should
know what you're installing: this is AI-generated software, maintained
by one person in their spare time who can't debug it line by line.

## ⚠️ As-is, no support

Provided **as is**, with no warranty of any kind (see GPLv3 sections
15-16 for the legal text). In plain English:

- **No guaranteed updates.** If Strava changes its API, this plugin
  may break. There's no roadmap and no release schedule.
- **No support channel.** There's no help desk, no email, no Discord.
  Bug reports and pull requests on GitHub Issues are welcome but will
  be looked at when (and if) time allows — and any fix will most
  likely be vibe coded too.
- **Use at your own risk.** It only writes to *your* Strava account
  using *your* API credentials, so the blast radius is your own data —
  but please review what a bulk edit does on a small selection before
  hitting "Apply" to 500 activities.
- **Fork it.** It's GPLv3 — if you need a fix and nobody's coming,
  clone the repo (or point your own AI at it) and change it yourself.
  That's the whole point of free software.

Not affiliated with Strava, Inc.

## License

GPLv3, same as the parent project.
