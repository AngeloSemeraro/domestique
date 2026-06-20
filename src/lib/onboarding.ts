/**
 * Returns which required environment variables are missing or invalid.
 * The onboarding wizard kicks in whenever this list is non-empty.
 */
export function missingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.STRAVA_CLIENT_ID?.trim()) missing.push("STRAVA_CLIENT_ID");
  if (!process.env.STRAVA_CLIENT_SECRET?.trim())
    missing.push("STRAVA_CLIENT_SECRET");
  if ((process.env.SESSION_SECRET?.length ?? 0) < 32)
    missing.push("SESSION_SECRET");
  if (!process.env.NEXT_PUBLIC_APP_URL?.trim())
    missing.push("NEXT_PUBLIC_APP_URL");
  return missing;
}

export function isSelfHosted(): boolean {
  // Vercel / similar set NODE_ENV=production and a host indicator. We only
  // allow writing .env.local when we're running locally (dev or self-host
  // start). On Vercel the FS is read-only anyway.
  return process.env.VERCEL !== "1" && process.env.RAILWAY_ENVIRONMENT == null;
}
