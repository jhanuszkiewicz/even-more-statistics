import { defineConfig } from "vite";

// Relative base so the site works under a GitHub Pages project path.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
});
