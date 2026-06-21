import { logoSrc } from "@/lib/api";

/**
 * App logo. Renders the icon on a rounded tile. Used in the header,
 * login screen and onboarding wizard so the brand mark stays consistent.
 *
 * The source is `/icon.png` in the Next.js build (served from /public)
 * and whatever `window.SBE_BOOTSTRAP.iconUrl` points at in the WordPress
 * plugin bundle. Uses a plain <img> in both cases — keeps the same
 * component working in both builds without pulling in next/image.
 */
export default function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-xl shadow-md shadow-strava/30"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc()}
        alt="Strava Batch Editor logo"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    </div>
  );
}
