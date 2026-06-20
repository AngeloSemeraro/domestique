import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/strava";

export const dynamic = "force-dynamic";

type UploadBody = {
  /** Raw file contents. */
  data: string;
  /** "gpx" | "tcx". Defaults to gpx for backwards compatibility. */
  dataType?: "gpx" | "tcx";
  /** Legacy field name — still accepted as gpx content. */
  gpx?: string;
  name: string;
  description?: string;
  external_id?: string;
  trainer?: boolean;
  commute?: boolean;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as UploadBody;
  const content = body.data ?? body.gpx;
  const dataType = body.dataType ?? "gpx";
  if (!content || !body.name) {
    return NextResponse.json(
      { error: "file content and name required" },
      { status: 400 }
    );
  }
  const token = await getValidAccessToken();

  const mime =
    dataType === "tcx" ? "application/vnd.garmin.tcx+xml" : "application/gpx+xml";

  const fd = new FormData();
  fd.set("data_type", dataType);
  fd.set("name", body.name);
  if (body.description) fd.set("description", body.description);
  if (body.external_id) fd.set("external_id", body.external_id);
  if (body.trainer) fd.set("trainer", "1");
  if (body.commute) fd.set("commute", "1");
  fd.set("file", new Blob([content], { type: mime }), `merged.${dataType}`);

  const res = await fetch("https://www.strava.com/api/v3/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let error = data?.message ?? `strava ${res.status}`;
    if (res.status === 409 || /duplicate/i.test(String(data?.error ?? data?.message ?? ""))) {
      const dup = data?.error ?? data?.message ?? "duplicate";
      error = `Strava rejected the upload as a ${dup}. Delete the source activities on strava.com first, or use the download option.`;
    }
    return NextResponse.json({ error, raw: data }, { status: res.status });
  }
  return NextResponse.json(data);
}
