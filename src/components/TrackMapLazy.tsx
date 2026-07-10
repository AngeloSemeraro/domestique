"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { TrackMapProps } from "./TrackMap";

/**
 * Client-only loader for TrackMap. Leaflet touches `window` at import time,
 * so the map must never be imported during SSR. `next/dynamic` would do this
 * in the Next.js app, but the same components are also bundled by Vite for
 * the WordPress plugin where `next/*` doesn't exist — a useEffect-gated
 * dynamic import works identically in both builds.
 */
export default function TrackMapLazy(props: TrackMapProps) {
  const [Comp, setComp] = useState<ComponentType<TrackMapProps> | null>(null);

  useEffect(() => {
    let alive = true;
    import("./TrackMap").then((m) => {
      if (alive) setComp(() => m.default);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!Comp) {
    return (
      <div
        className={`w-full animate-pulse rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-input)] ${
          props.className ?? "h-80"
        }`}
      />
    );
  }
  return <Comp {...props} />;
}
