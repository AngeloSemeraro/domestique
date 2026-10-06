import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isSelfHosted } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

type Body = {
  clientId: string;
  clientSecret: string;
};

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Report the current Strava client id (semi-public, safe to echo) so the
 * Preferences form can prefill it. The client secret is never returned.
 */
export async function GET() {
  return NextResponse.json({
    selfHosted: isSelfHosted(),
    clientId: process.env.STRAVA_CLIENT_ID?.trim() ?? "",
    hasSecret: Boolean(process.env.STRAVA_CLIENT_SECRET?.trim()),
  });
}

/**
 * Self-hosted only: update STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET in
 * .env.local without touching the rest of the file (SESSION_SECRET, app URL,
 * comments are preserved). Used when the user regenerates their Strava API
 * credentials. Takes effect after the next restart.
 */
export async function POST(req: NextRequest) {
  if (!isSelfHosted()) {
    return NextResponse.json(
      {
        error:
          "This host's environment is read-only — update the STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET variables in your hosting dashboard instead.",
      },
      { status: 400 }
    );
  }

  const body = (await req.json()) as Body;
  const clientId = clean(body.clientId);
  const clientSecret = clean(body.clientSecret);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "clientId and clientSecret are required" },
      { status: 400 }
    );
  }
  if (/[\r\n]/.test(clientId + clientSecret)) {
    return NextResponse.json(
      { error: "values must not contain newlines" },
      { status: 400 }
    );
  }

  const envPath = path.join(process.cwd(), ".env.local");

  // Start from the existing file so we preserve every other line. If there's
  // no file yet, seed the other required values from the running process so
  // the app keeps working after the rewrite.
  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf8");
  } catch {
    const seed: string[] = ["# Written by Domestique settings"];
    if (process.env.NEXT_PUBLIC_APP_URL)
      seed.push(`NEXT_PUBLIC_APP_URL=${process.env.NEXT_PUBLIC_APP_URL}`);
    if (process.env.SESSION_SECRET)
      seed.push(`SESSION_SECRET=${process.env.SESSION_SECRET}`);
    existing = seed.join("\n") + "\n";
  }

  const upsert = (text: string, key: string, value: string): string => {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) return text.replace(re, line);
    return (text.endsWith("\n") || text === "" ? text : text + "\n") + line + "\n";
  };

  let next = upsert(existing, "STRAVA_CLIENT_ID", clientId);
  next = upsert(next, "STRAVA_CLIENT_SECRET", clientSecret);

  try {
    // Back up the previous file so prior secrets are recoverable.
    try {
      await fs.copyFile(envPath, `${envPath}.bak`);
    } catch {
      /* no existing file */
    }
    await fs.writeFile(envPath, next, { encoding: "utf8", mode: 0o600 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "write failed", path: envPath },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, path: envPath });
}
