import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        strava: "#FC4C02",
      },
    },
  },
  plugins: [],
};

export default config;
