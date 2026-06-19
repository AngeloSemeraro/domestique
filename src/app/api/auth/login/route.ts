import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "Missing STRAVA_CLIENT_ID or NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${appUrl}/api/auth/callback`,
    approval_prompt: "auto",
    scope: "read,activity:read_all,activity:write,profile:read_all",
  });
  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`
  );
}
