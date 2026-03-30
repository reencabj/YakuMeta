import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Cambiar al nombre del repo en GitHub Pages: '/rp-meta-manager/'
const BASE = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  plugins: [react()],
  base: BASE,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
