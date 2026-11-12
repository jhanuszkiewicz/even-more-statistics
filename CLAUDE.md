# Even More Statistics

Project map in memory vault: ~/dev/ClaudeVault/projects/cube_charts/cube_charts_moc.md — read it at session start.

Repository: https://github.com/jhanuszkiewicz/even-more-statistics (local folder: `cube_charts`).

Static site with charts and analyses built from the WCA results export (v2).

- `pipeline/` — Python + DuckDB (run with `uv`). `build.py` checks the export date, downloads the TSV export only when it changed, writes Parquet files and JSON aggregates to `web/public/data/`.
- `web/` — Vite + TypeScript, DuckDB-WASM and Observable Plot. Reads the files from `data/`.
- `.github/workflows/update.yml` — daily cron: build data when a new export exists, deploy to GitHub Pages.

Rules:
- Never publish `competitions.delegates`, `competitions.organizers` (they contain e-mails) or other columns not needed by the site.
- Keep the WCA attribution with the export date visible on every page.
- Results are in centiseconds; -1 = DNF, -2 = DNS, 0 = no result. `333fm` single is moves, average is moves × 100; `333mbf` uses a packed encoding.
