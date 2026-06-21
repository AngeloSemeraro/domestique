import Image from "next/image";

/**
 * App logo. Renders the icon.png on a rounded tile. Used in the header,
 * login screen and onboarding wizard so the brand mark stays consistent.
 */
export default function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-xl shadow-md shadow-strava/30"
      style={{ width: size, height: size }}
    >
      <Image
        src="/icon.png"
        alt="Strava Batch Editor logo"
        width={size}
        height={size}
        priority
      />
    </div>
  );
}
