import { Heart } from "lucide-react";

const CREDITS = [
  { name: "Next.js", url: "https://nextjs.org" },
  { name: "React", url: "https://react.dev" },
  { name: "TypeScript", url: "https://www.typescriptlang.org" },
  { name: "Tailwind CSS", url: "https://tailwindcss.com" },
  { name: "Geist font", url: "https://vercel.com/font" },
  { name: "lucide-react", url: "https://lucide.dev" },
  { name: "react-day-picker", url: "https://daypicker.dev" },
  { name: "iron-session", url: "https://github.com/vvo/iron-session" },
  { name: "fit-file-parser", url: "https://github.com/jimmyppi/fit-file-parser" },
  { name: "OpenStreetMap / Nominatim", url: "https://nominatim.org" },
  { name: "Strava API", url: "https://developers.strava.com" },
];

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-[color:var(--border)] bg-[color:var(--bg-elev)]/40">
      <div
        className="mx-auto space-y-4 py-6 text-xs text-[color:var(--fg-muted)] md:py-8"
        style={{
          maxWidth: "1440px",
          paddingLeft: "clamp(1rem, 6vw, 8rem)",
          paddingRight: "clamp(1rem, 6vw, 8rem)",
        }}
      >
        <p className="leading-relaxed">
          <strong className="text-[color:var(--fg)]">
            Free software, built in the open.
          </strong>{" "}
          Strava Batch Editor is given to you as-is, with no warranty.
          It&apos;s a side project — please use at your own risk. If it saved
          you a click or two, share it with a riding buddy who&apos;d find it
          useful. Long live free software{" "}
          <Heart className="inline h-3 w-3 fill-strava text-strava" />.
        </p>

        <p className="leading-relaxed">
          <span className="text-[color:var(--fg)]">Standing on:</span>{" "}
          {CREDITS.map((c, i) => (
            <span key={c.name}>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="![color:inherit] hover:!text-strava hover:underline"
              >
                {c.name}
              </a>
              {i < CREDITS.length - 1 ? " · " : ""}
            </span>
          ))}
          .
        </p>

        <p className="text-[10px] uppercase tracking-wider opacity-60">
          Not affiliated with Strava, Inc.
        </p>
      </div>
    </footer>
  );
}
