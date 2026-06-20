import { getSession, StravaSession } from "./session";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_OAUTH = "https://www.strava.com/oauth/token";

export type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  timezone: string | null;
  gear_id: string | null;
  trainer: boolean;
  commute: boolean;
  private: boolean;
  hide_from_home?: boolean;
};

export type StravaGear = {
  id: string;
  name: string;
  primary: boolean;
  resource_state: number;
  distance: number;
};

export type StravaAthlete = {
  id: number;
  firstname: string;
  lastname: string;
  bikes?: StravaGear[];
  shoes?: StravaGear[];
};

export const SPORT_TYPES = [
  "AlpineSki", "BackcountrySki", "Badminton", "Canoeing", "Crossfit",
  "EBikeRide", "Elliptical", "EMountainBikeRide", "Golf", "GravelRide",
  "Handcycle", "HighIntensityIntervalTraining", "Hike", "IceSkate",
  "InlineSkate", "Kayaking", "Kitesurf", "MountainBikeRide", "NordicSki",
  "Pickleball", "Pilates", "Racquetball", "Ride", "RockClimbing",
  "RollerSki", "Rowing", "Run", "Sail", "Skateboard", "Snowboard",
  "Snowshoe", "Soccer", "Squash", "StairStepper", "StandUpPaddling",
  "Surfing", "Swim", "TableTennis", "Tennis", "TrailRun", "Velomobile",
  "VirtualRide", "VirtualRow", "VirtualRun", "Walk", "WeightTraining",
  "Wheelchair", "Windsurf", "Workout", "Yoga"
] as const;

async function refreshAccessToken(session: StravaSession): Promise<void> {
  const res = await fetch(STRAVA_OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  session.accessToken = data.access_token;
  session.refreshToken = data.refresh_token;
  session.expiresAt = data.expires_at;
}

export async function getValidAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session.accessToken || !session.refreshToken) {
    throw new Error("Not authenticated");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!session.expiresAt || session.expiresAt - 60 < now) {
    await refreshAccessToken(session);
    await session.save();
  }
  return session.accessToken!;
}

export async function stravaFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getValidAccessToken();
  return fetch(`${STRAVA_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function listActivities(params: {
  before?: number;
  after?: number;
  page?: number;
  per_page?: number;
}): Promise<StravaActivity[]> {
  const qs = new URLSearchParams();
  if (params.before) qs.set("before", String(params.before));
  if (params.after) qs.set("after", String(params.after));
  if (params.page) qs.set("page", String(params.page));
  qs.set("per_page", String(params.per_page ?? 100));
  const res = await stravaFetch(`/athlete/activities?${qs.toString()}`);
  if (!res.ok) throw new Error(`Strava list failed: ${res.status}`);
  return res.json();
}

export async function getAthlete(): Promise<StravaAthlete> {
  const res = await stravaFetch("/athlete");
  if (!res.ok) throw new Error(`Strava athlete failed: ${res.status}`);
  return res.json();
}

export type ActivityUpdate = {
  sport_type?: string;
  gear_id?: string;
  hide_from_home?: boolean;
  trainer?: boolean;
};

export async function updateActivity(
  id: number,
  update: ActivityUpdate
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await stravaFetch(`/activities/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, status: res.status, error };
  }
  return { ok: true };
}
