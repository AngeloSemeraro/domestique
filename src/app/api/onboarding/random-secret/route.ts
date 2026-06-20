import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/** Returns a 32-byte base64 string suitable for SESSION_SECRET. */
export async function GET() {
  const secret = randomBytes(32).toString("base64");
  return NextResponse.json({ secret });
}
