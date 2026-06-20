import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/strava";

export const dynamic = "force-dynamic";

type UploadBody = {
  gpx: string;
  name: string;
  description?: string;
  external_id?: string;
  trainer?: boolean;
  commute?: boolean;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as UploadBody;
  if (!body.gpx || !body.name) {
    return NextResponse.json({ error: "gpx and name required" }, { status: 400 });
  }
  const token = await getValidAccessToken();

  const fd = new FormData();
  fd.set("data_type", "gpx");
  fd.set("name", body.name);
  if (body.description) fd.set("description", body.description);
  if (body.external_id) fd.set("external_id", body.external_id);
  if (body.trainer) fd.set("trainer", "1");
  if (body.commute) fd.set("commute", "1");
  fd.set(
    "file",
    new Blob([body.gpx], { type: "application/gpx+xml" }),
    "merged.gpx"
  );

  const res = await fetch("https://www.strava.com/api/v3/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.message ?? `strava ${res.status}`, raw: data },
      { status: res.status }
    );
  }
  return NextResponse.json(data);
}
