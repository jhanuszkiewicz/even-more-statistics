import { resolve } from "node:path";
import { type Plugin, defineConfig } from "vite";
import { PAGES, SITE_NAME } from "./site.config.ts";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Fills the shared header, footer and home page cards into every HTML page.
 * Links are relative to the page, so the site works under any base path.
 */
function layout(): Plugin {
  return {
    name: "site-layout",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // "/index.html" -> depth 0, "/competitions/index.html" -> depth 1.
        const depth = ctx.path.split("/").length - 2;
        const root = depth === 0 ? "./" : "../".repeat(depth);
        const header = `<header>
      <a class="brand" href="${root}">${SITE_NAME}</a>
      <p class="sub">Charts and analyses of WCA competition results. <span id="export-date"></span></p>
    </header>`;
        const footer = `<footer>
      <p id="attribution"></p>
      <p><a href="${root}">All analyses</a></p>
    </footer>`;
        const cards = PAGES.map(
          (p) => `<li><a class="card" href="${root}${p.slug}/"><h2>${escape(p.title)}</h2><p>${escape(p.description)}</p></a></li>`,
        ).join("\n        ");
        return html
          .replace("<!--site-header-->", header)
          .replace("<!--site-footer-->", footer)
          .replace("<!--page-cards-->", cards);
      },
    },
  };
}

// Relative base so the site works under a GitHub Pages project path.
export default defineConfig({
  base: "./",
  plugins: [layout()],
  build: {
    target: "es2022",
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        ...Object.fromEntries(PAGES.map((p) => [p.slug, resolve(import.meta.dirname, p.slug, "index.html")])),
      },
    },
  },
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
});
