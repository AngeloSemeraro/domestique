"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar } from "lucide-react";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  disabled?: boolean;
};

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatHuman(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DatePickerPopover({
  value,
  onChange,
  label,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        popoverRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const now = new Date();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm transition-colors hover:border-strava focus:border-strava focus:outline-none focus:ring-2 focus:ring-strava/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{formatHuman(value)}</span>
        <Calendar className="h-3.5 w-3.5 text-[color:var(--fg-muted)]" />
      </button>

      {open &&
        mounted &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
            className="animate-scale-in rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-2 shadow-xl"
            role="dialog"
            aria-label={label ?? "Pick a date"}
          >
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected ?? now}
              onSelect={(d) => {
                if (d) {
                  onChange(isoDay(d));
                  setOpen(false);
                }
              }}
              captionLayout="dropdown"
              startMonth={new Date(2000, 0)}
              endMonth={new Date(now.getFullYear() + 1, 11)}
              showOutsideDays
              className="rdp-strava"
            />
          </div>,
          document.body
        )}
    </>
  );
}
