import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rwgpsCurrentUser, rwgpsExchangeCode } from "@/lib/rwgps";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/?rwgps_error=${error ?? "missing_code"}`
    );
  }

  try {
    const token = await rwgpsExchangeCode(
      code,
      `${appUrl}/api/rwgps/auth/callback`
    );
    const user = await rwgpsCurrentUser(token.access_token);
    const session = await getSession();
    session.rwgpsAccessToken = token.access_token;
    session.rwgpsUserName = user?.name;
    await session.save();
    return NextResponse.redirect(`${appUrl}/?rwgps_connected=1`);
  } catch {
    return NextResponse.redirect(`${appUrl}/?rwgps_error=token_exchange_failed`);
  }
}
