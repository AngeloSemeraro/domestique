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
            <p className="mt-1 text-[24px] font-bold uppercase leading-[31px] text-[color:var(--accent)]">
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
        {/* 17px pink shelf, flush with the bottom of the tabs (Figma:
            content border-top: 17px solid #EF95B0). It tucks 1px behind the
            tabs (z-0) so the SVG wings' anti-aliased bottom edge meets pink,
            not the dark header — kills the hairline seam under the wings. */}
        <div className="relative z-0 -mt-px h-[18px] bg-[color:var(--accent)]" />
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
  // Literal colours (not CSS vars): Safari fails to resolve a variable inside
  // an SVG `fill`, which left the wings unpainted.
  const fill = active ? "#EF95B0" : "#565148";
  const fg = active ? "#33302A" : "#DFBDBA";
  return (
    <button
      onClick={onClick}
      className="dq-tab"
      style={{ color: fg, zIndex: active ? 30 : depth }}
    >
      <svg
        className="dq-wing dq-l"
        width="47"
        height="71"
        viewBox="0 0 47 71"
        aria-hidden
        focusable="false"
      >
        <path
          fill={fill}
          d="M7.57597 17.2106C8.96619 7.34007 17.4125 0 27.3805 0H47V71H0L7.57597 17.2106Z"
        />
      </svg>
      <span className="dq-mid" style={{ background: fill, color: fg }}>
        {tab.label}
      </span>
      <svg
        className="dq-wing dq-r"
        width="69"
        height="71"
        viewBox="0 0 69 71"
        aria-hidden
        focusable="false"
      >
        {/* Shadow drawn as a crescent OUTSIDE the wing (not behind its fill),
            so the pink fill's anti-aliased edge never sits over dark — that
            bleed was the faint seam along the wing's sloped edge. */}
        <path
          fill="#000000"
          fillOpacity="0.25"
          d="M19.62 0C29.587 0 38.034 7.34006 39.424 17.2106L47 71L69 71L61.424 17.2106C60.034 7.34006 51.587 0 41.62 0Z"
        />
        <path
          fill={fill}
          d="M0 0H19.62C29.587 0 38.034 7.34006 39.424 17.2106L47 71H0V0Z"
        />
      </svg>
    </button>
  );
}
