import { defineConfig } from "vite";

// Tauri expects a fixed port and does not want the dev server cleared.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Rust sources are compiled by cargo, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Android WebView / modern desktop webviews.
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
