import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isSelfHosted } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

type Body = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  appUrl: string;
};

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Self-hosted only: write .env.local in the project root with the values
 * collected by the onboarding wizard. Refuses to run when the env is
 * read-only (Vercel/Railway) — the wizard should instead show the values
 * for the user to paste manually into the host's env-var settings.
 */
export async function POST(req: NextRequest) {
  if (!isSelfHosted()) {
    return NextResponse.json(
      { error: "Filesystem writes disabled in this environment" },
      { status: 400 }
    );
  }
  const body = (await req.json()) as Body;
  const clientId = clean(body.clientId);
  const clientSecret = clean(body.clientSecret);
  const sessionSecret = clean(body.sessionSecret);
  const appUrl = clean(body.appUrl) || "http://localhost:3000";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "clientId and clientSecret are required" },
      { status: 400 }
    );
  }
  if (sessionSecret.length < 32) {
    return NextResponse.json(
      { error: "sessionSecret must be at least 32 characters" },
      { status: 400 }
    );
  }
  if (/[\r\n]/.test(clientId + clientSecret + sessionSecret + appUrl)) {
    return NextResponse.json(
      { error: "values must not contain newlines" },
      { status: 400 }
    );
  }

  const envPath = path.join(process.cwd(), ".env.local");
  const contents = [
    "# Written by Domestique onboarding wizard",
    `STRAVA_CLIENT_ID=${clientId}`,
    `STRAVA_CLIENT_SECRET=${clientSecret}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `SESSION_SECRET=${sessionSecret}`,
    "",
  ].join("\n");

  try {
    // Back up any existing file so the user can recover prior secrets.
    try {
      await fs.copyFile(envPath, `${envPath}.bak`);
    } catch {
      /* no existing file */
    }
    await fs.writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "write failed",
        path: envPath,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, path: envPath });
}
