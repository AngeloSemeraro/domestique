import { NextRequest, NextResponse } from "next/server";
import { stravaFetch } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const qs = new URLSearchParams({
    keys: "latlng,time,altitude,heartrate,cadence",
    key_by_type: "true",
  });
  const res = await stravaFetch(`/activities/${id}/streams?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `strava ${res.status}: ${text}` },
      { status: res.status }
    );
  }
  return NextResponse.json(await res.json());
}
