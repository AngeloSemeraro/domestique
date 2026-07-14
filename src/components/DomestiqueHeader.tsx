"use client";

import Wordmark from "./Wordmark";

export type HeaderTab = { id: string; label: string };

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
        <header className="overflow-hidden bg-[color:var(--header-bg)] text-[color:var(--accent)]">
          <Wordmark className="block h-auto w-full" />
          <p className="px-4 pb-4 -mt-[2%] text-[clamp(0.7rem,1.4vw,1rem)] font-extrabold uppercase tracking-[0.12em] md:px-8">
            Does the dirty work for your rides
          </p>
        </header>
      )}

      <nav className="sticky top-0 z-30 bg-[color:var(--header-bg)] px-4 md:px-8">
        <div className="flex items-end gap-1.5 overflow-x-auto pt-2">
          {leftTabs.map((t) => (
            <FolderTab
              key={t.id}
              tab={t}
              active={t.id === active}
              onClick={() => onChange(t.id)}
            />
          ))}
          {rightTabs && rightTabs.length > 0 && (
            <div className="ml-auto flex items-end gap-1.5">
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
        {/* full-bleed pink folder spine the active tab merges into */}
        <div className="-mx-4 h-2.5 bg-[color:var(--accent)] md:-mx-8" />
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
      className={`relative whitespace-nowrap rounded-t-xl px-5 text-sm font-semibold tracking-tight transition-colors ${
        active
          ? "bg-[color:var(--accent)] text-[color:var(--accent-fg)] pb-3 pt-3"
          : "bg-[color:var(--tab-inactive)] text-[color:var(--tab-inactive-fg)] pb-2.5 pt-2 hover:brightness-110"
      }`}
    >
      {tab.label}
    </button>
  );
}
