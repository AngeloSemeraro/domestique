"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginHref } from "@/lib/api";

type Invoker = (cmd: string, args?: unknown) => Promise<unknown>;

/**
 * Tauri's invoke, however this build exposes it. `__TAURI_INTERNALS__.invoke`
 * is always injected inside the webview; `__TAURI__.core.invoke` exists only
 * with withGlobalTauri. Returns undefined in a normal browser.
 */
function getInvoke(): Invoker | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: Invoker };
    __TAURI__?: { core?: { invoke?: Invoker } };
  };
  return w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke;
}

const BUTTON_CLASS =
  "group animate-fade-in inline-flex items-center gap-2 rounded-full bg-strava px-6 py-3 font-semibold !text-[color:var(--accent-fg)] shadow-lg shadow-strava/30 transition-all hover:scale-[1.02] hover:brightness-95 active:scale-[0.98]";

/**
 * "Connect with Strava". In a normal browser it's a plain link to the OAuth
 * flow. Inside the Tauri desktop app (where Apple/Google refuse to sign in
 * within an embedded webview) it instead opens the login in the system browser
 * and polls `/api/auth/adopt` until the session lands, then reloads.
 */
export default function ConnectStrava() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIsDesktop(!!getInvoke());
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

  // Open the login in the system browser. Prefer the opener plugin; fall back to
  // the custom command. Surface a message if neither is callable.
  const openBrowser = useCallback(async () => {
    const invoke = getInvoke();
    if (!invoke) {
      setErr("Could not reach the desktop bridge.");
      return;
    }
    const url = "http://localhost:3000/api/auth/login?desktop=1";
    try {
      await invoke("plugin:opener|open_url", { url });
    } catch {
      try {
        await invoke("open_login");
      } catch (e2) {
        setErr(`Couldn't open the browser: ${String(e2)}`);
      }
    }
  }, []);

  const onDesktopClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setErr(null);
      void openBrowser();
      setWaiting(true);
      startPolling();
    },
    [openBrowser, startPolling]
  );

  if (!isDesktop) {
    return (
      <a href={loginHref()} className={BUTTON_CLASS}>
        Connect with Strava
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={onDesktopClick} className={BUTTON_CLASS}>
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
      </button>
      {waiting && (
        <p className="max-w-xs text-center text-sm text-[color:var(--fg-muted)]">
          Complete the Strava login in your browser — this window will connect
          automatically. <button type="button" onClick={onDesktopClick} className="underline">Reopen</button>
        </p>
      )}
      {err && (
        <p className="max-w-xs text-center text-sm text-red-500">{err}</p>
      )}
    </div>
  );
}
