import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createPwaManifest, createStaticPrecache } from "./vite.config";

export default defineConfig({
  base: "/Somewhere/",
  plugins: [
    VitePWA({
      injectRegister: "script",
      registerType: "prompt",
      includeAssets: [
        "apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
      ],
      includeManifestIcons: false,
      manifest: createPwaManifest("./test-harness"),
      workbox: createStaticPrecache("somewhere-test-harness"),
    }),
  ],
  build: {
    emptyOutDir: true,
    outDir: "dist-e2e",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
      },
    },
  },
});
