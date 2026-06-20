"use client";

import { useEffect, useRef, useState } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const now = new Date();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm transition-colors hover:border-strava focus:border-strava focus:outline-none focus:ring-2 focus:ring-strava/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{formatHuman(value)}</span>
        <Calendar className="h-3.5 w-3.5 text-[color:var(--fg-muted)]" />
      </button>

      {open && (
        <div
          className="animate-scale-in absolute left-0 top-full z-50 mt-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-2 shadow-xl"
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
        </div>
      )}
    </div>
  );
}
