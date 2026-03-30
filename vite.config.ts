import { copyFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * GitHub Pages no tiene fallback a index.html en rutas profundas (p. ej. /pedidos).
 * Al refrescar, el servidor busca un archivo que no existe y devuelve 404. Copiar index → 404.html
 * hace que Pages sirva la misma SPA; React Router lee la URL y pinta la ruta correcta.
 */
function githubPagesSpa404(): Plugin {
  return {
    name: "github-pages-spa-404",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), githubPagesSpa404()],
  base: "/",
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