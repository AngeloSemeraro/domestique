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
          <div className="relative flex items-end pl-[5px] pt-3">
            {leftTabs.map((t, i) => (
              <FolderTab
                key={t.id}
                tab={t}
                active={t.id === active}
                depth={leftTabs.length - i}
                onClick={() => onChange(t.id)}
              />
            ))}
            {rightTabs && rightTabs.length > 0 && (
              <div className="ml-auto flex items-end pr-[5px]">
                {rightTabs.map((t) => (
                  <FolderTab
                    key={t.id}
                    tab={t}
                    active={t.id === active}
                    depth={1}
                    onClick={() => onChange(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {/* full-bleed pink folder spine — its top sits 47px below the tab top
            (i.e. overlaps the bottom 24px of the 71px tabs), behind them, so
            the active tab merges into it and the gaps reveal pink. */}
        <div className="relative z-0 -mt-6 h-9 bg-[color:var(--accent)]" />
      </nav>
    </>
  );
}

function FolderTab({
  tab,
  active,
  depth,
  onClick,
}: {
  tab: HeaderTab;
  active: boolean;
  /** Higher = drawn on top; active always wins so left tabs overlap right. */
  depth: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`dq-tab ${active ? "dq-tab--active" : "dq-tab--inactive"}`}
      style={
        {
          "--dq-tab-bg": active ? "var(--accent)" : "var(--tab-inactive)",
          "--dq-tab-fg": active
            ? "var(--accent-fg)"
            : "var(--tab-inactive-fg)",
          zIndex: active ? 30 : depth,
        } as CSSProperties
      }
    >
      <i className="l" aria-hidden />
      <span>{tab.label}</span>
      <i className="r" aria-hidden />
    </button>
  );
}
