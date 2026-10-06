import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Brand accent. Kept named "strava" so the many existing
        // text-strava / bg-strava / accent-strava usages flip to the new
        // Domestique pink in one place.
        strava: "#EF95B0",
        ink: "#33302A",
        sand: "#DBD7CE",
        olive: "#565148",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out both",
        "scale-in": "scale-in 180ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
