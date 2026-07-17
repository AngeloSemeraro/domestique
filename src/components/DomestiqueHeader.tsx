"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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

/** Where the tabs start unscrolled (Figma: tab top = 335px). */
const HEADER_H = 335;
const HEADER_PT = 28; // pt-7
const TAB_H = 71; // folder-tab height
const SPINE_H = 17; // pink shelf net height (18px, tucked 1px behind tabs)
/** The fixed espresso band must reach the bottom of the pink spine at the
 *  tabs' *lowest* (unscrolled) position, so it always backs the transparent
 *  tabs no matter how far they've travelled up. */
const HEADER_FIXED_H = HEADER_H + TAB_H + SPINE_H; // 423

/**
 * Brand header. The pink "Domestique" wordmark + tagline sit on a *fixed*
 * espresso band that never moves. The "archive folder" tab bar starts at
 * 335px and, on scroll, slides up with the page until it reaches the
 * wordmark's vertical middle, where it pins. The tab bar has a **transparent**
 * background, so once pinned the fixed wordmark shows through behind it and
 * the page content scrolls underneath the whole band.
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
  const logoRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // Where the tabs pin: top padding + half the rendered wordmark height, i.e.
  // the wordmark's vertical middle.
  const [capH, setCapH] = useState(130);
  // Height of the fixed espresso band. It tracks the bottom of the pink shelf
  // as the tabs slide up and pin, so content always emerges right under the
  // tabs — never leaving an empty dark gap — while still keeping the fixed
  // tagline sitting on espresso.
  const [bandH, setBandH] = useState(HEADER_FIXED_H);
  useEffect(() => {
    if (!showWordmark) return;
    // Smallest the band may shrink to: keep the fixed tagline on espresso.
    let minBand = HEADER_PT + 200;
    const measure = () => {
      const h = logoRef.current?.getBoundingClientRect().height ?? 0;
      if (h) setCapH(Math.round(HEADER_PT + h / 2));
      const tb = taglineRef.current?.getBoundingClientRect().bottom ?? 0;
      if (tb) minBand = Math.ceil(tb + 8);
      syncBand();
    };
    const syncBand = () => {
      // nav's viewport bottom = bottom of the pink shelf = where content starts.
      const b = navRef.current?.getBoundingClientRect().bottom ?? HEADER_FIXED_H;
      setBandH(Math.max(Math.ceil(b), minBand));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", syncBand, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", syncBand);
    };
  }, [showWordmark]);

  return (
    <>
      {showWordmark && (
        <>
          {/* Fixed espresso band: logo + tagline stay put; the band reaches
              down far enough to sit behind the tabs at every scroll position. */}
          <header
            className="fixed inset-x-0 top-0 z-10 bg-[color:var(--header-bg)] text-[color:var(--accent)]"
            style={{ height: bandH }}
          >
            <div style={containerStyle} className="pt-7">
              <div ref={logoRef}>
                <Wordmark className="block h-auto w-full" />
              </div>
              <p
                ref={taglineRef}
                className="mt-1 text-[24px] font-bold uppercase leading-[31px] text-[color:var(--accent)]"
              >
                Does the dirty work for your rides
              </p>
            </div>
          </header>
          {/* Spacer that pushes the (out-of-flow) tab bar down to 335px. */}
          <div aria-hidden style={{ height: HEADER_H }} />
        </>
      )}

      <nav
        ref={navRef}
        className="sticky z-30 bg-transparent"
        style={{ top: showWordmark ? capH : 0 }}
      >
        <div style={containerStyle}>
          <div className="relative flex items-end pl-[5px]">
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
      <span className="dq-mid">
        <svg className="dq-mid-bg" preserveAspectRatio="none" aria-hidden focusable="false">
          <rect width="100%" height="100%" fill={fill} />
        </svg>
        <span className="dq-mid-label">{tab.label}</span>
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
