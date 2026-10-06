import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "Missing STRAVA_CLIENT_ID or NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }
  // The desktop app opens this flow in the system browser (so Apple/Google
  // sign-in works); it marks the request so the callback knows to stash the
  // session for the webview to adopt.
  const desktop = req.nextUrl.searchParams.get("desktop") === "1";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${appUrl}/api/auth/callback`,
    approval_prompt: "auto",
    scope: "read,activity:read_all,activity:write,profile:read_all",
  });
  if (desktop) params.set("state", "desktop");
  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`
  );
}
