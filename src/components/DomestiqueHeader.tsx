"use client";

import type { CSSProperties } from "react";
import Wordmark from "./Wordmark";

export type HeaderTab = { id: string; label: string };

/** Shared page geometry — wordmark, tabs and content all line up to this. */
export const CONTAINER_MAX = 1440;
export const CONTAINER_PAD = "clamp(1rem, 6vw, 8rem)";
const containerStyle: CSSProperties = {
  maxWidth: CONTAINER_MAX,
  marginInline: "auto",
  paddingLeft: CONTAINER_PAD,
  paddingRight: CONTAINER_PAD,
};

/**
 * Brand header used by both the standalone app and the WordPress plugin:
 * the big pink "Domestique" wordmark + tagline on the dark espresso band,
 * then a sticky "archive folder" tab bar. When the page scrolls, the
 * wordmark slides up behind the tab bar, which pins to the top so only the
 * content below keeps scrolling.
 */
export default function DomestiqueHeader({
  leftTabs,
  rightTabs,
  active,
  onChange,
  showWordmark = true,
}: {
  leftTabs: HeaderTab[];
  rightTabs?: HeaderTab[];
  active: string;
  onChange: (id: string) => void;
  showWordmark?: boolean;
}) {
  return (
    <>
      {showWordmark && (
        <header className="bg-[color:var(--header-bg)] text-[color:var(--accent)]">
          <div style={containerStyle} className="pt-5 md:pt-7">
            <Wordmark className="block h-auto w-full" />
            <p className="mt-1 text-[clamp(0.7rem,1.5vw,1.05rem)] font-extrabold uppercase tracking-[0.14em]">
              Does the dirty work for your rides
            </p>
          </div>
        </header>
      )}

      <nav className="sticky top-0 z-30 bg-[color:var(--header-bg)]">
        <div style={containerStyle}>
          <div className="flex items-end gap-2 overflow-x-auto pt-3">
            {leftTabs.map((t) => (
              <FolderTab
                key={t.id}
                tab={t}
                active={t.id === active}
                onClick={() => onChange(t.id)}
              />
            ))}
            {rightTabs && rightTabs.length > 0 && (
              <div className="ml-auto flex items-end gap-2 pl-4">
                {rightTabs.map((t) => (
                  <FolderTab
                    key={t.id}
                    tab={t}
                    active={t.id === active}
                    onClick={() => onChange(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {/* full-bleed pink folder spine; casts a soft shadow onto the content */}
        <div className="h-2.5 bg-[color:var(--accent)] shadow-[0_6px_14px_-4px_rgba(0,0,0,0.28)]" />
      </nav>
    </>
  );
}

function FolderTab({
  tab,
  active,
  onClick,
}: {
  tab: HeaderTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative whitespace-nowrap rounded-t-[18px] px-6 text-[0.95rem] font-semibold tracking-tight transition-all ${
        active
          ? "z-10 bg-[color:var(--accent)] text-[color:var(--accent-fg)] pb-3.5 pt-3.5 shadow-[0_-2px_16px_rgba(0,0,0,0.34)]"
          : "bg-[color:var(--tab-inactive)] text-[color:var(--tab-inactive-fg)] pb-2.5 pt-2.5 shadow-[0_-1px_10px_rgba(0,0,0,0.28)] hover:brightness-110"
      }`}
    >
      {tab.label}
    </button>
  );
}
