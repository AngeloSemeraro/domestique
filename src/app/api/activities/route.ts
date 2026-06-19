import { NextRequest, NextResponse } from "next/server";
import { listActivities } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const after = sp.get("after");
  const before = sp.get("before");
  const page = sp.get("page");

  try {
    const activities = await listActivities({
      after: after ? Number(after) : undefined,
      before: before ? Number(before) : undefined,
      page: page ? Number(page) : 1,
      per_page: 100,
    });
    return NextResponse.json({ activities });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
