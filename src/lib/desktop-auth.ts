/**
 * Session hand-off for the desktop app.
 *
 * The Tauri desktop app runs the UI in an embedded webview, but Apple/Google
 * refuse their OAuth sign-in inside embedded webviews. So the desktop app opens
 * the Strava login in the system browser instead. The OAuth callback then lands
 * in that browser — a different cookie jar from the webview — so the webview
 * can't see the session it just created.
 *
 * To bridge them, the callback (when it came from the desktop flow) stashes the
 * freshly authenticated session here, in the single Node process that serves
 * the app, and the webview polls `/api/auth/adopt` to claim it and set its own
 * cookie. This is safe only because Domestique is a single-user, locally-served
 * app: the store lives in memory, holds one pending session, and expires fast.
 */
import type { StravaSession } from "./session";

export type PendingSession = Pick<
  StravaSession,
  "athleteId" | "athleteName" | "accessToken" | "refreshToken" | "expiresAt"
>;

const TTL_MS = 5 * 60 * 1000;

type Slot = { session: PendingSession; createdAt: number } | null;

// Stored on globalThis so it survives Next's module reloading within one server.
const g = globalThis as unknown as { __domestiquePendingAdopt?: Slot };

export function setPendingAdopt(session: PendingSession): void {
  g.__domestiquePendingAdopt = { session, createdAt: Date.now() };
}

/** Return and clear the pending session, if one is present and still fresh. */
export function takePendingAdopt(): PendingSession | null {
  const slot = g.__domestiquePendingAdopt ?? null;
  g.__domestiquePendingAdopt = null;
  if (!slot) return null;
  if (Date.now() - slot.createdAt > TTL_MS) return null;
  return slot.session;
}
