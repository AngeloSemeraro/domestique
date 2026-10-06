import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { takePendingAdopt } from "@/lib/desktop-auth";

/**
 * Desktop hand-off: the webview polls this after opening the login in the system
 * browser. When a freshly authenticated session is waiting, write it into this
 * request's cookie (so the webview becomes logged in) and report success.
 */
export async function GET() {
  const pending = takePendingAdopt();
  if (!pending) {
    return NextResponse.json({ ok: false });
  }
  const session = await getSession();
  session.athleteId = pending.athleteId;
  session.athleteName = pending.athleteName;
  session.accessToken = pending.accessToken;
  session.refreshToken = pending.refreshToken;
  session.expiresAt = pending.expiresAt;
  await session.save();
  return NextResponse.json({ ok: true });
}
