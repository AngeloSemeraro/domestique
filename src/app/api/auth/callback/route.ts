import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setPendingAdopt } from "@/lib/desktop-auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const isDesktop = req.nextUrl.searchParams.get("state") === "desktop";
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

  // Desktop flow: this ran in the system browser, a different cookie jar from
  // the app's webview. Stash the session so the webview can adopt it, and show
  // a small "return to the app" page instead of the full app.
  if (isDesktop) {
    setPendingAdopt({
      athleteId: session.athleteId,
      athleteName: session.athleteName,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    });
    return new NextResponse(RETURN_TO_APP_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(`${appUrl}/`);
}

const RETURN_TO_APP_HTML = `<!doctype html>
<html lang="it"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Domestique</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    background:#2b2622;color:#f4a6c0;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;text-align:center;padding:24px}
  h1{font-size:28px;margin:0}
  p{color:#b98aa0;max-width:28rem;line-height:1.5;margin:0}
</style></head>
<body>
  <h1>Accesso riuscito ✓</h1>
  <p>Torna all'app <b>Domestique</b>: si connetter&agrave; da sola. Puoi chiudere questa scheda.</p>
</body></html>`;
