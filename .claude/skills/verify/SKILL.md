---
name: verify
description: How to build, run and drive this app to verify UI changes at runtime.
---

# Verifying changes in this repo

Next.js 16 app (App Router, Tailwind). `npm run build` for the compile gate.
`next lint` is broken with Next 16 (subcommand removed) — don't rely on it.

## Runtime drive

The real app at `/` is auth-gated behind Strava OAuth (and redirects to
`/onboarding` when env vars are missing), so client components can't be
reached there without credentials.

Recipe that works for tab components (Inspector/Merge/Editor):

1. Create a throwaway harness page rendering the component directly, e.g.
   `src/app/harness-test/page.tsx` ("use client", render `<AnalyzerTab />`).
   Do NOT name the folder with a leading underscore — `_`-prefixed app
   folders are private and 404.
2. `npm run dev -- -p 3999` in the background.
3. Drive with `playwright-core` (install it in the scratchpad, not the repo)
   and `executablePath: "/opt/pw-browsers/chromium"`. Load files with
   `page.setInputFiles('input[type="file"]', fixture)`.
4. Generate GPX fixtures with a small node script (trkpt lat/lon/ele/time,
   `<wpt>` waypoints, gpxtpx hr/cad extensions).
5. Delete the harness page before committing.

Gotchas:
- OSM tile requests fail in the sandbox (`ERR_TUNNEL_CONNECTION_FAILED`);
  Leaflet still renders vectors/controls — ignore tile errors.
- Playwright clicks that auto-scroll the page invalidate earlier
  `boundingBox()` captures — re-measure before mouse gestures.
