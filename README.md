<div align="center">

<img src="public/icon.png" width="96" alt="Domestique logo" />

# Domestique

A *domestique* does the hard work so the team captain doesn't have to.
This one does it for your rides: **batch edit, merge, inspect and export
your Strava activities** — running entirely on your own machine, talking
only to your own Strava account.

**Free software (GPLv3) · self-hosted · no servers, no tracking, no accounts.**

</div>

---

## What it does

Three tools in one local web app:

### 🖊️ Batch edit
Select many activities at once and change them in a single pass:
- **Sport type** (Ride, MountainBikeRide, GravelRide, Run, TrailRun…)
- **Gear** (assign one of your bikes)
- **Activity type** (Default / Race / Workout / Long run)
- **Commute**, **Trainer (indoor)**, **Hide from feed** flags
- **Rename** inline (pencil next to any activity name, auto-saves to Strava)

Filter the list by date range (quick-range chips: 30d / 90d / 6m / 1y / YTD /
All), sport, name and location.

The activities list has two tabs — **Strava rides** and **Local files**
(.gpx/.fit) — and the selection from both feeds **Send / export**:
- **Download GPX (zip)** / **Download FIT (zip)** — every selected activity,
  exactly as recorded, in a single zip (FIT files come from a built-in
  encoder). Works with no setup. This is also the **Komoot** route: Komoot
  has [no public upload API](https://support.komoot.com/hc/en-us/articles/10331570510618-komoot-API)
  (partner integrations only, and its private API is off-limits per their
  terms), but <https://www.komoot.com/upload> accepts many files at once —
  download the zip, drop the files there, done. The disabled "Upload to
  Komoot" button in the UI says exactly this.
- **Upload to RideWithGPS** — connect your RideWithGPS account (OAuth) and
  upload the selection to your library in one batch. Optional: needs a free
  [RideWithGPS API client](https://ridewithgps.com/api/v1/doc) configured
  once (see setup below).

### 🔀 Merge rides
Combine multiple rides into one new activity:
- Sources can be **Strava activities and/or local `.gpx` / `.fit` files**, in
  any mix, picked from one unified box (same in all three tabs)
- **Movement filter** drops non-cycling stretches (long pauses, a train/car
  transfer between sessions) using speed + cadence + heart-rate signals, so the
  merged ride only contains the parts you actually rode
- **Average-speed control**: keep natural pacing, match a source's average, or
  hit a custom km/h target
- **Output**: upload straight to Strava, or download a **TCX** (recommended —
  carries the real distance odometer so the total is correct) or **GPX**

### 🔍 Inspector
Pick one of your Strava rides, drop a single `.gpx` / `.fit` (or send the
merge result here) to:
- **explore the track on an interactive map** (OpenStreetMap) with start/end
  markers, filter-dropped segments dashed, and **togglable waypoints** (GPX
  `<wpt>` / FIT course points)
- read a **detailed elevation profile colored by gradient**, using the same
  bands as a Wahoo ELEMNT head unit: green 0–4%, yellow 4–8%, orange 8–12%,
  red 12–20%, brown 20%+ (grey/blue for descents)
- **hover** the profile to see distance, altitude, grade % and elapsed time —
  the position is mirrored live on the map, and hovering the track on the map
  mirrors back onto the charts
- **zoom like an audio editor**: drag a range on the elevation profile (or
  scroll) to zoom into it, double-click to reset, drag the overview strip to
  pan — the map and the speed / HR / cadence charts all follow the zoom window
- see which sensors it has (GPS / HR / cadence / altitude) and their averages
- tune the movement filter live with kept/dropped charts for speed, HR, cadence
- download the cleaned file or publish it to Strava

Files **without timestamps** (route exports, drawn tracks) load fine: times
are synthesized (1 s per point) so charts, downloads and Strava upload still
work — the Inspector shows a notice when that happened.

> **Why TCX for uploads?** A GPX file has no distance field, so Strava recomputes
> distance by summing GPS points — which inflates the total when two source rides
> are far apart (e.g. you drove between them). TCX carries a per-point
> `DistanceMeters` odometer that skips those jumps, so Strava shows the real
> ridden distance. This is the same principle the FIT files other tools upload
> rely on.

---

## Run it yourself (≈ 5 minutes)

This app is **self-hosted**: it runs on your computer, your Strava credentials
live only in a local `.env.local` file, and nothing is ever sent to a third
party. You need [Node.js 18+](https://nodejs.org) and a Strava account.

```bash
git clone https://github.com/AngeloSemeraro/domestique.git
cd domestique
npm install
npm run dev
```

Open <http://localhost:3000>. On first run a **setup wizard** walks you through:

1. Creating a free Strava API application (it opens the portal and tells you
   exactly what to fill in — Authorization Callback Domain = `localhost`)
2. Pasting the **Client ID** and **Client Secret** back into the wizard
3. It generates a random session secret and writes everything to `.env.local`
   for you

Restart the dev server (`Ctrl+C`, then `npm run dev`), reload, and click
**Connect with Strava**.

### Manual setup (optional)

If you'd rather skip the wizard, copy `.env.example` to `.env.local` and fill:

```env
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=<openssl rand -base64 32>
```

Get the Client ID/Secret at <https://www.strava.com/settings/api>
(Authorization Callback Domain: `localhost`).

### Optional: RideWithGPS upload

To enable **Send to RideWithGPS** in the Batch edit tab, register a free API
client on your RideWithGPS account (developer/API settings — see
<https://ridewithgps.com/api/v1/doc>), set its OAuth redirect URI to
`<your app URL>/api/rwgps/auth/callback`, and add to `.env.local`:

```env
RWGPS_CLIENT_ID=...
RWGPS_CLIENT_SECRET=...
# only if your API key differs from the client id:
RWGPS_API_KEY=
```

In the WordPress plugin the same credentials go in **Settings → Domestique**
(redirect URI is shown on that page). Each user then connects their
own RideWithGPS account from the Batch edit tab. Without credentials the
upload button stays disabled (its tooltip says why) — the GPX/FIT zip
downloads always work.

---

## Strava rate limits

Strava allows 200 requests / 15 min and 2,000 / day per application. Because
every user runs **their own** app, you get the full quota to yourself. Bulk
edits are throttled (250 ms between writes) and stop cleanly if you hit a limit.

---

## Also available: WordPress plugin

The same three tools (Batch edit, Merge rides, Inspector) ship as a
**self-contained WordPress plugin** — drop a shortcode on any page and the
app renders right there. Useful if you already host a WordPress site and
don't want to run Node locally.

| | Next.js (this repo) | WordPress plugin |
|---|---|---|
| Where it runs | Your computer (`npm run dev`) | Your WordPress site |
| Login | Browser cookie session | Standard WordPress login |
| Multi-user | Single user per install | Each WP user connects their own Strava |
| Access | `localhost:3000` | Any page with `[domestique]` |

**Shortcodes** the plugin exposes:

```
[domestique]                     full app, all three tabs
[domestique tab="edit"]          Batch edit only
[domestique tab="merge"]         Merge rides only
[domestique tab="inspector"]     Inspector only
[domestique_login]               just the Connect with Strava button
```

**Get it:**

- Pre-built installable ZIPs land on the [Releases page](https://github.com/AngeloSemeraro/domestique/releases)
- Or build from source — the plugin lives under [`wordpress-plugin/`](wordpress-plugin/):

  ```bash
  git clone https://github.com/AngeloSemeraro/domestique.git
  cd domestique/wordpress-plugin
  npm install && npm run build
  zip -r domestique.zip domestique -x "*.DS_Store"
  ```

  Then in WordPress: **Plugins → Add New → Upload Plugin** → pick the zip →
  **Activate** → **Settings → Domestique** to paste your Strava API
  credentials. See [`wordpress-plugin/README.md`](wordpress-plugin/README.md)
  for the full architecture (PHP backend, REST endpoints, OAuth flow).

Same GPLv3 license, same TCX-with-distance logic, same per-user token
storage. Pick the build that fits your hosting story.

---

## A note on deleting / merging

Strava's public API has **no delete endpoint** and **no native merge**. So:
- The Merge tool creates a *new* activity; the originals stay on your profile.
  Hide them via the Batch edit tab or delete them by hand on strava.com.
- Uploading a merge whose source rides are still on Strava will be rejected as
  a duplicate — delete the sources first, or use the download option.

---

## Tech

Next.js (App Router) · React · TypeScript · Tailwind CSS · Geist · lucide-react ·
react-day-picker · iron-session · fit-file-parser · Leaflet +
OpenStreetMap (Inspector map + tiles) · OpenStreetMap/Nominatim
(reverse geocoding) · fflate (zip export) · RideWithGPS API (optional batch
upload). See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and
how to help.

## 🤖 Vibe coded with Claude

This whole thing was vibe coded using **Claude Code**. I'm not a
developer and I don't read the code — I described what I wanted,
tested the result in the browser, and shipped what worked. You should
know what you're installing: this is AI-generated software, maintained
by one person in their spare time who can't debug it line by line.

## ⚠️ As-is, no support

Domestique is provided **as is**, with no warranty of any kind
(see GPLv3 sections 15-16 for the legal text). In plain English:

- **No guaranteed updates.** If Strava changes its API, this tool may
  break. There's no roadmap and no release schedule.
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

[GPLv3](LICENSE) — free software. Use it, share it, improve it.

If it saves you time, share it with a friend who rides. 🚴
