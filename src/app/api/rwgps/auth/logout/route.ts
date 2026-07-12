import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.rwgpsAccessToken = undefined;
  session.rwgpsUserName = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
