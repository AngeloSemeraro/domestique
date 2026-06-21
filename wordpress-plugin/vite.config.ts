import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Builds an IIFE bundle that mounts the React app into every
 * <div class="sbe-mount"> on the page. The output goes straight into
 * the plugin's assets/ folder so a fresh build is ready to ship.
 *
 * Tailwind is processed via the project's postcss.config.js (the WP-side
 * tailwind.config.ts here scans both this folder and the shared ../src so
 * the same utility classes work in both builds).
 */
export default defineConfig({
  plugins: [react()],
  // Resolve the same @/* alias the Next.js app uses, pointing back at
  // ../src so we share lib/* and components/* verbatim.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "strava-batch-editor/assets"),
    emptyOutDir: false, // keep the icon.png that already lives there
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "SBE",
      formats: ["iife"],
      fileName: () => "js/app.iife.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (asset) => {
          if (asset.name && asset.name.endsWith(".css")) {
            return "css/app.css";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
});
