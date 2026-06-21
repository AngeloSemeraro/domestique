<div align="center">

<img src="public/icon.png" width="96" alt="Strava Batch Editor logo" />

# Strava Batch Editor

Edit, merge and clean up your Strava rides in bulk — runs entirely on
your own machine, talks only to your own Strava account.

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

### 🔀 Merge rides
Combine multiple rides into one new activity:
- Sources can be **Strava activities and/or local `.gpx` / `.fit` files**, in
  any mix
- **Movement filter** drops non-cycling stretches (long pauses, a train/car
  transfer between sessions) using speed + cadence + heart-rate signals, so the
  merged ride only contains the parts you actually rode
- **Average-speed control**: keep natural pacing, match a source's average, or
  hit a custom km/h target
- **Output**: upload straight to Strava, or download a **TCX** (recommended —
  carries the real distance odometer so the total is correct) or **GPX**

### 🔍 Inspector
Drop a single `.gpx` / `.fit` (or send the merge result here) to:
- see which sensors it has (GPS / HR / cadence / altitude) and their averages
- tune the movement filter live with kept/dropped charts for speed, HR, cadence
- download the cleaned file or publish it to Strava

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
git clone https://github.com/AngeloSemeraro/strava_batch_editor.git
cd strava_batch_editor
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

---

## Strava rate limits

Strava allows 200 requests / 15 min and 2,000 / day per application. Because
every user runs **their own** app, you get the full quota to yourself. Bulk
edits are throttled (250 ms between writes) and stop cleanly if you hit a limit.

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
react-day-picker · iron-session · fit-file-parser · OpenStreetMap/Nominatim
(reverse geocoding). See [CONTRIBUTING.md](CONTRIBUTING.md) for the project
layout and how to help.

## License

[GPLv3](LICENSE) — free software. Use it, share it, improve it. Provided as is,
with no warranty; use at your own risk. Not affiliated with Strava, Inc.

If it saves you time, share it with a friend who rides. 🚴
