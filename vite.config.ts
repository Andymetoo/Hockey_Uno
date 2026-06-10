import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    lib: {
      entry: resolve(__dirname, "src/ouija-main.ts"),
      formats: ["iife"],
      name: "OuijaSimulatorRuntime",
      fileName: () => "ouija.js"
    },
    outDir: "ouija-build",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          if (name.endsWith(".css")) {
            return "ouija.css";
          }

          return "assets/[name][extname]";
        }
      }
    }
  }
});
