/**
 * Server-side RideWithGPS API client (OAuth + trip upload).
 *
 * All RWGPS specifics are centralized here on purpose: the official docs
 * live at https://ridewithgps.com/api/v1/doc (see also
 * https://github.com/ridewithgps/developers). The site owner registers an
 * API client on their RWGPS account settings page to obtain the OAuth
 * client id / secret used below.
 *
 * RWGPS_BASE_URL exists so tests can point this module at a mock server.
 */

const BASE = () => process.env.RWGPS_BASE_URL ?? "https://ridewithgps.com";

export function rwgpsConfigured(): boolean {
  return !!(process.env.RWGPS_CLIENT_ID && process.env.RWGPS_CLIENT_SECRET);
}

export function rwgpsAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.RWGPS_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return `${BASE()}/oauth/authorize?${params.toString()}`;
}

export async function rwgpsExchangeCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string }> {
  const res = await fetch(`${BASE()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: process.env.RWGPS_CLIENT_ID,
      client_secret: process.env.RWGPS_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `RideWithGPS token exchange failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return { access_token: data.access_token as string };
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    // The v1 API identifies the calling app by its key; RWGPS_API_KEY can
    // override when it differs from the OAuth client id.
    "x-rwgps-api-key": process.env.RWGPS_API_KEY ?? process.env.RWGPS_CLIENT_ID ?? "",
    Accept: "application/json",
  };
}

export async function rwgpsCurrentUser(
  token: string
): Promise<{ id?: number; name?: string } | null> {
  const res = await fetch(`${BASE()}/api/v1/users/current.json`, {
    headers: apiHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const u = data.user ?? data;
  return { id: u?.id, name: u?.name ?? u?.display_name };
}

export type RwgpsUploadResult = {
  ok: boolean;
  status: number;
  /** Trip id when the API returned one directly. */
  trip_id?: number;
  url?: string;
  error?: string;
  raw?: unknown;
};

/**
 * Upload a GPX file as a new RWGPS trip. Tries the v1 endpoint first and
 * falls back to the long-standing legacy upload route, since both are in
 * the wild and the account's API client determines which is enabled.
 */
export async function rwgpsUploadTrip(
  token: string,
  gpx: string,
  name: string,
  description?: string
): Promise<RwgpsUploadResult> {
  const attempts: Array<{ url: string; fd: FormData; headers: Record<string, string> }> = [];

  const fdV1 = new FormData();
  fdV1.set("file", new Blob([gpx], { type: "application/gpx+xml" }), `${slugFile(name)}.gpx`);
  fdV1.set("trip[name]", name);
  if (description) fdV1.set("trip[description]", description);
  attempts.push({ url: `${BASE()}/api/v1/trips.json`, fd: fdV1, headers: apiHeaders(token) });

  const fdLegacy = new FormData();
  fdLegacy.set("file", new Blob([gpx], { type: "application/gpx+xml" }), `${slugFile(name)}.gpx`);
  fdLegacy.set("trip[name]", name);
  if (description) fdLegacy.set("trip[description]", description);
  fdLegacy.set("apikey", process.env.RWGPS_API_KEY ?? process.env.RWGPS_CLIENT_ID ?? "");
  fdLegacy.set("version", "2");
  fdLegacy.set("auth_token", token);
  attempts.push({
    url: `${BASE()}/trips.json`,
    fd: fdLegacy,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  let last: RwgpsUploadResult = { ok: false, status: 0, error: "no attempt made" };
  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: "POST",
      headers: attempt.headers,
      body: attempt.fd,
    });
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    console.log(`[rwgps] POST ${attempt.url} -> ${res.status}`);
    if (res.ok) {
      const trip = (data.trip ?? data) as { id?: number };
      return {
        ok: true,
        status: res.status,
        trip_id: trip?.id,
        url: trip?.id ? `https://ridewithgps.com/trips/${trip.id}` : undefined,
        raw: data,
      };
    }
    last = {
      ok: false,
      status: res.status,
      error:
        (data.error as string) ??
        (Array.isArray(data.errors) ? data.errors.join(", ") : undefined) ??
        `RideWithGPS ${res.status}`,
      raw: data,
    };
    // Only fall through to the legacy endpoint when the v1 route just
    // doesn't exist for this account — auth/validation errors are final.
    if (![404, 405, 410].includes(res.status)) break;
  }
  return last;
}

function slugFile(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "activity"
  );
}
