import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { type ManifestOptions, VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

export function createPwaManifest(id = "."): Partial<ManifestOptions> {
  return {
    id,
    name: "Somewhere — Hidden Compass",
    short_name: "Somewhere",
    description: "A quiet hidden-destination compass for discovering somewhere new.",
    start_url: ".",
    scope: ".",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f1e8",
    theme_color: "#17231c",
    icons: [
      {
        src: "icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export function createStaticPrecache(cacheId: string): NonNullable<VitePWAOptions["workbox"]> {
  return {
    cacheId,
    globPatterns: ["index.html", "assets/*-????????.{css,js}"],
    navigateFallback: "index.html",
    navigateFallbackDenylist: [
      /^\/(?:Somewhere\/)?(?:api|constraints?|diagnostics|feedback|field|journeys?|routes?|showcase|test-harness|trace)(?:\/|$)/,
    ],
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  };
}

export default defineConfig({
  base: "/Somewhere/",
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
      ],
      includeManifestIcons: false,
      manifest: createPwaManifest(),
      workbox: createStaticPrecache("somewhere-consumer"),
    }),
  ],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
      },
    },
  },
});
