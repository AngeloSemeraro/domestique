import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rwgpsConfigured } from "@/lib/rwgps";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    configured: rwgpsConfigured(),
    connected: !!session.rwgpsAccessToken,
    name: session.rwgpsUserName ?? null,
  });
}
