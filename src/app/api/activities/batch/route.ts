import { NextRequest, NextResponse } from "next/server";
import { ActivityUpdate, updateActivity } from "@/lib/strava";

type FlatRequest = { ids: number[]; update: ActivityUpdate };
type PerActivityRequest = { updates: Array<{ id: number; update: ActivityUpdate }> };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<FlatRequest & PerActivityRequest>;

  let queue: Array<{ id: number; update: ActivityUpdate }> = [];
  if (Array.isArray(body.updates)) {
    queue = body.updates.filter(
      (u) => u.id && u.update && Object.keys(u.update).length > 0
    );
  } else if (Array.isArray(body.ids) && body.update) {
    if (Object.keys(body.update).length === 0) {
      return NextResponse.json({ error: "update required" }, { status: 400 });
    }
    queue = body.ids.map((id) => ({ id, update: body.update! }));
  } else {
    return NextResponse.json(
      { error: "ids+update or updates[] required" },
      { status: 400 }
    );
  }

  if (queue.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const { id, update } of queue) {
    const res = await updateActivity(id, update);
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
