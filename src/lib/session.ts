import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";

export type StravaSession = {
  athleteId?: number;
  athleteName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

const secret = process.env.SESSION_SECRET ?? "";

// A `Secure` cookie is only sent over HTTPS — and is dropped outright when the
// app is served over http://localhost (as it is by the desktop app, whose
// production Next server still runs on plain http). So gate `secure` on the app
// actually being served over HTTPS, not merely on NODE_ENV=production; otherwise
// the session cookie never sticks and Strava login silently fails.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const isHttps = appUrl.startsWith("https://");

export const sessionOptions: SessionOptions = {
  password: secret,
  cookieName: "domestique_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  return getIronSession<StravaSession>(await cookies(), sessionOptions);
}
