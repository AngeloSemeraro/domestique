"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginHref } from "@/lib/api";

/** True inside the Tauri desktop webview (its internals global is always set). */
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

const DESKTOP_LOGIN_URL = "/api/auth/login?desktop=1";

const BUTTON_CLASS =
  "group animate-fade-in inline-flex items-center gap-2 rounded-full bg-strava px-6 py-3 font-semibold !text-[color:var(--accent-fg)] shadow-lg shadow-strava/30 transition-all hover:scale-[1.02] hover:brightness-95 active:scale-[0.98]";

/**
 * "Connect with Strava".
 *
 * Normal browser: a plain link through the OAuth flow.
 *
 * Tauri desktop app: Apple/Google refuse to sign in inside an embedded webview,
 * so navigating to the login URL is intercepted by the Rust side and opened in
 * the system browser instead (the navigation is cancelled, so this page stays
 * put). We then poll `/api/auth/adopt` until the session lands and reload.
 */
export default function ConnectStrava() {
  const [desktop, setDesktop] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDesktop(isTauri());
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const startPolling = useCallback(() => {
    if (timer.current) return;
    timer.current = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/adopt", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean };
        if (data.ok) {
          if (timer.current) clearInterval(timer.current);
          window.location.href = "/";
        }
      } catch {
        /* server not ready yet — keep polling */
      }
    }, 1500);
  }, []);

  // Desktop: kick off the login (Rust intercepts the navigation and opens the
  // system browser) and start polling. Don't preventDefault on the anchor — the
  // navigation itself is what Rust intercepts.
  const onConnect = useCallback(() => {
    setWaiting(true);
    startPolling();
  }, [startPolling]);

  const reopen = useCallback(() => {
    startPolling();
    window.location.assign(DESKTOP_LOGIN_URL);
  }, [startPolling]);

  if (!desktop) {
    return (
      <a href={loginHref()} className={BUTTON_CLASS}>
        Connect with Strava
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <a href={DESKTOP_LOGIN_URL} onClick={onConnect} className={BUTTON_CLASS}>
        {waiting ? (
          <>
            Waiting for browser…
            <Loader2 className="h-4 w-4 animate-spin" />
          </>
        ) : (
          <>
            Connect with Strava
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </a>
      {waiting && (
        <p className="max-w-xs text-center text-sm text-[color:var(--fg-muted)]">
          Complete the Strava login in your browser — this window will connect
          automatically.{" "}
          <button type="button" onClick={reopen} className="underline">
            Reopen
          </button>
        </p>
      )}
    </div>
  );
}
