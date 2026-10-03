import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "web/index.html"),
        admin: resolve(import.meta.dirname, "web/admin.html"),
      },
    },
  },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
});
