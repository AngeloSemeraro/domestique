# Contributing

Thanks for wanting to help! This is a small free-software project — issues,
fixes and ideas are all welcome.

## Ground rules

- By contributing you agree your changes are released under the project's
  **GPLv3** license.
- Be kind. This is a hobby project maintained in spare time.
- Not affiliated with Strava — please don't do anything that violates the
  [Strava API agreement](https://www.strava.com/legal/api).

## Getting set up

```bash
git clone https://github.com/AngeloSemeraro/strava_batch_editor.git
cd strava_batch_editor
npm install
npm run dev
```

You'll need your own Strava API app (the first-run wizard sets this up, or see
the README's manual setup). Credentials live in `.env.local`, which is
git-ignored — never commit it.

Before opening a PR:

```bash
npm run build   # must pass (type-check + production build)
npm run lint
```

## Project layout

```
src/
  app/
    page.tsx                 # entry: redirects to /onboarding if env missing,
                             # else login screen or the app shell
    onboarding/page.tsx      # first-run setup wizard route
    api/
      auth/                  # OAuth login / callback / logout / revoke
      activities/            # list + batch update (PUT /activities/{id})
      streams/[id]/          # fetch activity streams for merging
      uploads/               # upload GPX/TCX to Strava + poll status
      geocode/               # Nominatim reverse-geocode proxy
      onboarding/            # status / save-env / random-secret
  components/
    AppShell.tsx             # header, tabs, footer, settings modal
    Editor.tsx               # Batch edit tab
    MergeTab.tsx             # Merge rides tab
    AnalyzerTab.tsx          # Inspector tab
    TrackMap.tsx             # Inspector's Leaflet map (+ TrackMapLazy.tsx loader)
    ElevationProfile.tsx     # gradient-colored, zoomable elevation view
    OnboardingWizard.tsx     # 4-step setup
    ...
  lib/
    strava.ts                # Strava API client + token refresh
    gpx.ts                   # merge planning, GPX + TCX builders, filters
    file-parsers.ts          # browser-side GPX + FIT parsing
    session.ts               # iron-session config
    onboarding.ts            # env-var checks
```

## Where logic lives

- **Merging / filtering / distance** is all in `src/lib/gpx.ts`. The shared
  `planMergedGroups()` produces the ordered, filtered points with a cumulative
  distance that skips teleports; `buildMergedGpx` and `buildMergedTcx` render
  from it. If you touch distance/time behaviour, this is the file.
- **File parsing** (`src/lib/file-parsers.ts`) runs entirely in the browser —
  no upload happens during parsing. Keep optional streams (HR/cadence/altitude/
  temperature) aligned to the `latlng` length using `undefined` for gaps.
- **Strava writes** go through `/api/activities/batch` and `/api/uploads`.

## Good first issues

- More editable fields in Batch edit (description, private notes)
- A map preview of the merged track
- Batch-hide the source rides right after a merge
- Smoothing window for the movement filter (instead of point-to-point speed)
- i18n (the UI is English-only today)

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and — if
it's about a merge/upload — the activity or a sample `.gpx`/`.fit` if you can
share one. Screenshots of the Strava result vs the Inspector help a lot.
