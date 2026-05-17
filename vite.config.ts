import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  // Strip `console.*` and `debugger` from production builds. Dev keeps them so
  // the existing error toasts + console.error fallbacks remain useful while
  // working locally. (`drop` only applies during esbuild's minify pass, which
  // Vite runs for `vite build`, not `vite dev`.)
  esbuild: {
    drop: ["console", "debugger"],
  },
});
