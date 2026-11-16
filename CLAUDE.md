# Even More Statistics

Project map in memory vault: ~/dev/ClaudeVault/projects/cube_charts/cube_charts_moc.md — read it at session start.

Repository: https://github.com/jhanuszkiewicz/even-more-statistics (local folder: `cube_charts`).

Static site with charts and analyses built from the WCA results export (v2). No backend: the pipeline writes Parquet + JSON, the browser reads them.

## Commands
No test suite; `npm run build` (type check + bundle) is the check. `web/public/data/` is gitignored, so a fresh clone or worktree has no data until the pipeline runs or it is copied from another checkout.
```
cd web && npm ci                          # install
cd web && npm run dev                     # dev server, :5173; create web/public/data/ BEFORE starting it
cd web && npm run build                   # tsc --noEmit && vite build -> web/dist
cd web && npm run preview -- --port 4173  # serve web/dist (as .claude/launch.json does)
cd web && npx vite preview --base /even-more-statistics/   # test the Pages sub-path
cd pipeline && uv run python build.py [--out DIR] [--zip FILE] [--force]
```
- Full pipeline run: downloads the ~390 MB TSV zip (~2 min on CI), rewrites `web/public/data/` (only a folder with `manifest.json` or an empty one). Without `--force` it exits with "Up to date" when the export date matches `manifest.json`.
- Small sample (3 s): pass a local zip. `--zip` still calls the WCA API for the version check (needs network). Make the sample from a real export zip: extract `metadata.json` and `WCA_export_*.tsv` except `result_attempts` and `scrambles`, `head -n 20001` on `WCA_export_results.tsv`, re-zip, then `uv run python build.py --zip sample.zip --out /tmp/ems_data`; copy that folder to `web/public/data`.

## Code map
- `pipeline/build.py` — whole pipeline: export API check → TSV zip → DuckDB tables (`load_tables`, row-count guard) → `build()`: `results/<event>.parquet` (one per event, sorted by person for range requests), `persons`/`competitions`/`ranks_*.parquet`, `lookups.json`, `aggregates/*.json`, `manifest.json` (export date, attribution, file sizes). Builds into a temp staging dir, then swaps.
- `pipeline/aggregates/*.sql` — one query per JSON aggregate (`<name>.sql` → `aggregates/<name>.json`); add a file to add an aggregate.
- `pipeline/aggregates/per_event/*.sql` — query returning an `event_id` column, split into `aggregates/<name>/<event>.json` (one file per event, also empty ones), e.g. `top_cutoffs` (10th/100th place per year and region).
- `web/site.config.ts` — `PAGES` list (slug, title, description): drives Vite inputs, home page cards, header/footer. `web/vite.config.ts` — `layout()` plugin fills `<!--site-header-->`, `<!--site-footer-->`, `<!--page-cards-->`; `base: "./"`.
- `web/<slug>/index.html` + `web/src/pages/<slug>.ts` — one page per analysis: `competitions`, `competitors`, `pb-distribution`, `top-cutoffs`, `rankings` (JSON aggregates + Observable Plot), `progression` (live DuckDB-WASM query on Parquet by WCA ID); `index.html` + `pages/home.ts` is the home page.
- `web/src/site.ts` — `runPage()` (loads manifest + lookups, fills export date and attribution), `$`, `show`, `width`, `fillEventSelect`, `bindSelect`/`setParams` (control state in URL params).
- `web/src/data.ts` — `dataUrl()`/`fetchJson()`, URLs resolved from module location (must stay directly in `src/`). `web/src/db.ts` — lazy DuckDB-WASM `getDb()`/`query()`; import it only from pages with live queries. `web/src/format.ts` — result formatting (centiseconds, FM, MBF decoding).
- `.github/workflows/update.yml` — daily cron (06:15 UTC), push to `main`, manual run (`force` input): fetch deployed `manifest.json` → `build.py` → `npm ci && npm run build` → deploy to GitHub Pages; later steps run only when `changed=true`.

## Rules
- Never publish `competitions.delegates`, `competitions.organizers` (they contain e-mails) or other columns not needed by the site.
- Keep the WCA attribution with the export date visible on every page.
- Results are in centiseconds; -1 = DNF, -2 = DNS, 0 = no result. `333fm` single is moves, average is moves × 100; `333mbf` uses a packed encoding.
- Adding a page: new `web/<slug>/index.html` (copy an existing one) + `web/src/pages/<slug>.ts` + entry in `web/site.config.ts`.
