# Strava Batch Editor

Webapp to edit many Strava activities at once: sport type, gear (bike),
indoor (trainer) flag, and feed visibility (`hide_from_home`).

Filters: date range, sport type, name search, location (city / state / country).

Built with Next.js 15 + TypeScript + Tailwind. Auth via Strava OAuth2,
session stored in an encrypted httpOnly cookie (`iron-session`).

---

## 1. Create a Strava API application

1. Go to <https://www.strava.com/settings/api>
2. Click **Create & Manage Your App** and fill in:
   - **Application Name**: anything (e.g. *Batch Editor*)
   - **Category**: *Other*
   - **Club / Website**: any URL (e.g. `http://localhost`)
   - **Authorization Callback Domain**: `localhost`
     *(when you deploy on Vercel, change this to your domain, e.g. `your-app.vercel.app` — Strava accepts only one domain, no protocol, no path)*
   - Upload any icon
3. After creation, copy **Client ID** and **Client Secret** — you'll need them next.

## 2. Local setup

```bash
git clone https://github.com/AngeloSemeraro/strava_batch_editor.git
cd strava_batch_editor
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```env
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=<paste output of: openssl rand -base64 32>
```

Run:

```bash
npm run dev
```

Open <http://localhost:3000> and click **Connect with Strava**.

## 3. Deploy on Vercel (when you're ready)

1. Push the repo to GitHub.
2. On <https://vercel.com> → **Add New… → Project** → import the repo.
3. In **Settings → Environment Variables** add:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `SESSION_SECRET` (a fresh 32+ char random string)
   - `NEXT_PUBLIC_APP_URL` = `https://<your-project>.vercel.app`
4. Deploy.
5. On Strava (<https://www.strava.com/settings/api>), set **Authorization Callback Domain** to `<your-project>.vercel.app` (no protocol).
6. Open the Vercel URL and log in.

## How it works

- **OAuth**: `/api/auth/login` redirects to Strava, `/api/auth/callback` exchanges
  the code for access/refresh tokens, stored in an encrypted cookie.
- **List**: `/api/activities` proxies `GET /athlete/activities` with `after`/`before`
  timestamps. The client pulls up to 5 pages (500 activities) per reload.
- **Batch update**: `/api/activities/batch` accepts `{ ids, update }`, then calls
  `PUT /activities/{id}` for each, with a 250 ms delay between calls and an
  immediate stop on HTTP 429. The client splits the queue in chunks of 5 and
  shows live progress.

## Strava rate limits

- 100 requests / 15 min, 1 000 / day per athlete.
- Each activity edit = 1 request. The page refresh of 500 activities = ~5
  requests (paged listing). Bulk-editing 100 activities in a sitting is fine.
- If you hit 429, wait 15 minutes and retry — the UI shows per-activity errors.

## Editable fields

- `sport_type` — e.g. `Ride`, `MountainBikeRide`, `GravelRide`, `Run`, `TrailRun`…
- `gear_id` — only **bikes** are listed in the dropdown (your registered bikes
  come from `GET /athlete`).
- `hide_from_home` — true/false, hides the activity from your followers' feed.
- `trainer` — true/false, marks as indoor/trainer.

(Other fields like `name`, `description`, `commute` are easy to add — they all
go through the same `PUT /activities/{id}`.)
