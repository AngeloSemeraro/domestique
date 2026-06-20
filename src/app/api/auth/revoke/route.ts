import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Revoke the Strava authorization for this athlete. Calls Strava's
 * /oauth/deauthorize so the user can re-authorize cleanly (or stop using
 * the app entirely) and then destroys the local session cookie.
 */
export async function POST() {
  const session = await getSession();
  const token = session.accessToken;
  let revoked = false;
  let revokeError: string | null = null;

  if (token) {
    try {
      const res = await fetch(
        `https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      revoked = res.ok;
      if (!res.ok) {
        revokeError = `strava ${res.status}`;
      }
    } catch (e) {
      revokeError = e instanceof Error ? e.message : "network error";
    }
  }

  session.destroy();
  return NextResponse.json({ revoked, error: revokeError });
}
