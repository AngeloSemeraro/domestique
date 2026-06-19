import { NextRequest, NextResponse } from "next/server";
import { ActivityUpdate, updateActivity } from "@/lib/strava";

type BatchRequest = {
  ids: number[];
  update: ActivityUpdate;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as BatchRequest;
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }
  if (!body.update || Object.keys(body.update).length === 0) {
    return NextResponse.json({ error: "update required" }, { status: 400 });
  }

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const id of body.ids) {
    const res = await updateActivity(id, body.update);
    if (res.ok) {
      results.push({ id, ok: true });
    } else {
      results.push({ id, ok: false, error: `${res.status}: ${res.error}` });
      if (res.status === 429) break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return NextResponse.json({ results });
}
