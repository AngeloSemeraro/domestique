import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/?error=${error ?? "missing_code"}`);
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`);
  }

  const data = await res.json();
  const session = await getSession();
  session.athleteId = data.athlete?.id;
  session.athleteName = `${data.athlete?.firstname ?? ""} ${data.athlete?.lastname ?? ""}`.trim();
  session.accessToken = data.access_token;
  session.refreshToken = data.refresh_token;
  session.expiresAt = data.expires_at;
  await session.save();

  return NextResponse.redirect(`${appUrl}/`);
}
