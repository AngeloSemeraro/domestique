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
  // ../src so we share lib/* and components/* verbatim. The explicit
  // react/react-dom aliases (plus `dedupe`) make sure every import of
  // React anywhere in the bundle resolves to the SAME copy under this
  // plugin's node_modules — without that, components imported from
  // ../src/* end up bundling the Next.js project's react too, which
  // causes "null is not an object (evaluating useContext)" hook errors.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-runtime.js"
      ),
      "react/jsx-dev-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-dev-runtime.js"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  // Next.js statically replaces process.env.NODE_ENV; Vite in lib mode
  // doesn't, and React (plus a few dev-mode shims) reference it at module
  // load — without this define the bundle throws "Can't find variable:
  // process" before mounting. We also stub the wider `process` global so
  // any rogue `process.env.X` read from a transitive dep evaluates to
  // undefined rather than crashing.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({}),
    "process.platform": JSON.stringify("browser"),
  },
  build: {
    outDir: path.resolve(__dirname, "domestique/assets"),
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
