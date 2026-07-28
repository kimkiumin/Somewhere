import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "/Somewhere/",
  build: {
    target: "es2022",
    outDir: mode === "test-harness" ? "dist-e2e" : "dist",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        showcase: fileURLToPath(new URL("showcase.html", import.meta.url)),
      },
    },
  },
}));
