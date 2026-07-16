import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rwgpsUploadTrip } from "@/lib/rwgps";

export const dynamic = "force-dynamic";

type TripBody = {
  /** GPX file contents, built client-side from the activity streams. */
  gpx: string;
  name: string;
  description?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  const token = session.rwgpsAccessToken;
  // TEMP diagnostic — prints to the dev server log (.domestique-launch.log)
  const cookieLen = (req.headers.get("cookie") ?? "").length;
  console.log(
    `[rwgps/trips] cookieBytes=${cookieLen} strava=${!!session.athleteId} ` +
      `rwgps=${token ? "YES(" + token.length + ")" : "NO"} keys=${Object.keys(session).join(",")}`
  );
  if (!token) {
    return NextResponse.json(
      { error: "Not connected to RideWithGPS" },
      { status: 401 }
    );
  }
  const body = (await req.json()) as TripBody;
  if (!body.gpx || !body.name) {
    return NextResponse.json(
      { error: "gpx content and name required" },
      { status: 400 }
    );
  }
  const result = await rwgpsUploadTrip(token, body.gpx, body.name, body.description);
  // TEMP diagnostic — the real RideWithGPS rejection reason
  console.log(
    `[rwgps/trips] upload status=${result.status} ok=${result.ok} ` +
      `error=${JSON.stringify(result.error)} raw=${JSON.stringify(result.raw).slice(0, 800)}`
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "upload failed", raw: result.raw },
      { status: result.status || 502 }
    );
  }
  return NextResponse.json(result);
}
