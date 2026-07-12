import { NextResponse } from "next/server";
import { rwgpsAuthorizeUrl, rwgpsConfigured } from "@/lib/rwgps";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!rwgpsConfigured() || !appUrl) {
    return NextResponse.json(
      { error: "Missing RWGPS_CLIENT_ID / RWGPS_CLIENT_SECRET (see README)" },
      { status: 500 }
    );
  }
  return NextResponse.redirect(
    rwgpsAuthorizeUrl(`${appUrl}/api/rwgps/auth/callback`)
  );
}
