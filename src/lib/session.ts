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

export const sessionOptions: SessionOptions = {
  password: secret,
  cookieName: "strava_batch_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  return getIronSession<StravaSession>(await cookies(), sessionOptions);
}
