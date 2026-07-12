/**
 * One-stop fetch that works both in the Next.js app and inside the
 * WordPress plugin bundle.
 *
 * In Next.js we hit `/api/...` routes directly. When the same React code
 * runs as the WP plugin's React bundle, `window.SBE_BOOTSTRAP` is present
 * (printed inline by the shortcode renderer) and points at the
 * `/wp-json/sbe/v1` REST root, with an `X-WP-Nonce` for auth.
 *
 * This module rewrites any `/api/...` path to the right backend so the
 * component code stays identical between the two builds.
 */

declare global {
  interface Window {
    SBE_BOOTSTRAP?: {
      restRoot: string; // e.g. https://site.com/wp-json/sbe/v1
      nonce: string;
      loginUrl: string; // already includes return URL
      logoutUrl: string;
      revokeUrl: string;
      meUrl: string;
      iconUrl: string;
      version: string;
      /** Present when the WP admin configured the RideWithGPS API client. */
      rwgpsLoginUrl?: string;
    };
  }
}

function bootstrap() {
  return typeof window !== "undefined" ? window.SBE_BOOTSTRAP : undefined;
}

/**
 * Map a Next.js-style /api/... path to whatever the current backend exposes.
 * Onboarding endpoints don't exist in WP (the admin settings page handles
 * configuration there) — those paths stay /api/... and will 404 in WP,
 * which is fine because the onboarding wizard never mounts in WP mode.
 */
function rewritePath(input: string): string {
  const boot = bootstrap();
  if (!boot) return input; // Next.js
  // strip leading /api so /api/activities → /activities
  const path = input.replace(/^\/api/, "");
  // restRoot has no trailing slash; path always starts with /
  return boot.restRoot.replace(/\/$/, "") + path;
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const boot = bootstrap();
  const url = rewritePath(input);
  if (!boot) return fetch(url, init);

  const headers = new Headers(init.headers ?? {});
  headers.set("X-WP-Nonce", boot.nonce);
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}

/** URL for the `<a href>` that starts the OAuth flow. */
export function loginHref(): string {
  return bootstrap()?.loginUrl ?? "/api/auth/login";
}

/** URL that starts the RideWithGPS OAuth flow (browser navigation). */
export function rwgpsLoginHref(): string {
  return bootstrap()?.rwgpsLoginUrl ?? "/api/rwgps/auth/login";
}

/** Where the AppShell's logo image is served from. */
export function logoSrc(): string {
  return bootstrap()?.iconUrl ?? "/icon.png";
}

export function isWordPressBuild(): boolean {
  return !!bootstrap();
}
