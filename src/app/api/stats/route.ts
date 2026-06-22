import { NextResponse } from "next/server";
import { stravaFetch } from "@/lib/strava";

export const dynamic = "force-dynamic";

/**
 * Returns the athlete's lifetime / YTD / recent totals. Strava's /stats
 * endpoint needs the athlete id, so we fetch /athlete first then chain.
 */
export async function GET() {
  try {
    const athRes = await stravaFetch("/athlete");
    if (!athRes.ok) {
      return NextResponse.json(
        { error: `strava athlete ${athRes.status}` },
        { status: athRes.status }
      );
    }
    const ath = await athRes.json();
    const id = Number(ath?.id ?? 0);
    if (!id) {
      return NextResponse.json({ error: "no athlete id" }, { status: 401 });
    }
    const statsRes = await stravaFetch(`/athletes/${id}/stats`);
    if (!statsRes.ok) {
      return NextResponse.json(
        { error: `strava stats ${statsRes.status}` },
        { status: statsRes.status }
      );
    }
    return NextResponse.json(await statsRes.json());
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
