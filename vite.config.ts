import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two build targets:
//   - default : the standalone single-page app (index.html -> dist/)
//   - "embed" : a self-mounting IIFE widget for embedding in other sites,
//               e.g. WordPress. Output: dist-embed/ascii-visualizer.js
export default defineConfig(({ mode }) => {
  if (mode === "embed") {
    return {
      build: {
        outDir: "dist-embed",
        emptyOutDir: true,
        lib: {
          entry: resolve(__dirname, "src/embed.ts"),
          name: "AsciiVisualizer",
          formats: ["iife"],
          fileName: () => "ascii-visualizer.js",
        },
        cssCodeSplit: false,
      },
    };
  }

  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
