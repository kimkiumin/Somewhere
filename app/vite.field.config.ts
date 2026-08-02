import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/Somewhere/",
  build: {
    outDir: "dist-field",
    rollupOptions: {
      input: {
        field: fileURLToPath(new URL("field.html", import.meta.url)),
      },
    },
  },
});
