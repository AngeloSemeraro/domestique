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
  const res = await stravaFetch(`/uploads/${id}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
