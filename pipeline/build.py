"""Build the site's data files from the WCA results export (v2, TSV).

Checks the latest export date, and only when it differs from the one in the
existing manifest (or with --force) downloads the export, converts the tables
the site needs to Parquet and computes the JSON aggregates in aggregates/*.sql.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import duckdb

EXPORT_API = "https://www.worldcubeassociation.org/api/v0/export/public"
SUPPORTED_MAJOR = "v2"
HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "web" / "public" / "data"
USER_AGENT = "cube-charts-pipeline"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=600) as resp, open(dest, "wb") as f:
        shutil.copyfileobj(resp, f, length=1 << 20)


def read_manifest(out: Path) -> dict | None:
    try:
        return json.loads((out / "manifest.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def set_github_output(**values: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in values.items():
                f.write(f"{k}={v}\n")


def load_tables(con: duckdb.DuckDBPyConnection, tsv_dir: Path) -> None:
    """Load the needed TSV files into DuckDB tables.

    The export's TSV files are unquoted and use the literal string NULL for
    missing values.
    """
    tables = [
        "results", "persons", "competitions", "events", "countries",
        "continents", "round_types", "formats", "ranks_single", "ranks_average",
    ]
    for name in tables:
        path = tsv_dir / f"WCA_export_{name}.tsv"
        con.execute(
            f"""CREATE TABLE {name} AS SELECT * FROM read_csv(
                ?, delim='\t', header=true, quote='', escape='',
                nullstr='NULL', sample_size=-1)""",
            [str(path)],
        )
        # Guard against silent row loss: the row count must match the line count.
        with open(path, "rb") as f:
            lines = sum(1 for _ in f) - 1
        rows = con.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
        if rows != lines:
            raise RuntimeError(f"{name}: parsed {rows} rows, file has {lines} lines")


def write_parquet(con: duckdb.DuckDBPyConnection, query: str, dest: Path) -> None:
    con.execute(
        f"COPY ({query}) TO '{dest}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 50000)"
    )


def build(tsv_dir: Path, out: Path, meta: dict) -> dict:
    con = duckdb.connect()
    load_tables(con, tsv_dir)

    # Competition dates are used by most charts; derive them once.
    con.execute(
        """CREATE TABLE comp AS SELECT
             id, name, city_name, country_id, cancelled = 1 AS cancelled,
             make_date(year, month, day) AS start_date,
             make_date(end_year, end_month, end_day) AS end_date,
             event_specs,
             latitude_microdegrees / 1e6 AS latitude,
             longitude_microdegrees / 1e6 AS longitude
           FROM competitions"""
    )

    (out / "results").mkdir(parents=True)
    files: dict[str, int] = {}

    def track(rel: str) -> None:
        files[rel] = (out / rel).stat().st_size

    # One results file per event, sorted by person so that a query for one
    # person reads only a few row groups over HTTP range requests.
    events = [r[0] for r in con.execute("SELECT id FROM events ORDER BY rank").fetchall()]
    for ev in events:
        rel = f"results/{ev}.parquet"
        write_parquet(
            con,
            f"""SELECT r.person_id, r.competition_id, c.start_date AS date,
                       r.round_type_id, r.format_id, r.pos::SMALLINT AS pos,
                       r.best::INTEGER AS best, r.average::INTEGER AS average,
                       r.regional_single_record, r.regional_average_record,
                       r.person_country_id
                FROM results r
                JOIN comp c ON c.id = r.competition_id
                JOIN round_types rt ON rt.id = r.round_type_id
                WHERE r.event_id = '{ev}'
                ORDER BY r.person_id, c.start_date, r.competition_id, rt.rank""",
            out / rel,
        )
        track(rel)

    simple = {
        "persons.parquet": "SELECT wca_id, name, country_id FROM persons WHERE sub_id = 1 ORDER BY wca_id",
        "competitions.parquet": "SELECT * FROM comp ORDER BY start_date, id",
        "ranks_single.parquet": "SELECT * FROM ranks_single ORDER BY event_id, world_rank",
        "ranks_average.parquet": "SELECT * FROM ranks_average ORDER BY event_id, world_rank",
    }
    for rel, query in simple.items():
        write_parquet(con, query, out / rel)
        track(rel)

    # Small lookup tables go to one JSON file the UI loads at start.
    lookups = {
        "events": "SELECT id, name, format, rank FROM events ORDER BY rank",
        "countries": "SELECT id, name, continent_id, iso2 FROM countries ORDER BY name",
        "continents": "SELECT id, name, record_name FROM continents ORDER BY name",
        "round_types": "SELECT id, name, rank, final = 1 AS final FROM round_types ORDER BY rank",
        "formats": "SELECT id, name FROM formats",
    }
    (out / "lookups.json").write_text(
        json.dumps({k: rows_as_dicts(con, q) for k, q in lookups.items()}, default=str)
    )
    track("lookups.json")

    (out / "aggregates").mkdir()
    for sql_file in sorted((HERE / "aggregates").glob("*.sql")):
        rel = f"aggregates/{sql_file.stem}.json"
        rows = rows_as_dicts(con, sql_file.read_text())
        (out / rel).write_text(json.dumps(rows, default=str, separators=(",", ":")))
        track(rel)

    export_date = meta["export_date"]
    date_label = datetime.fromisoformat(export_date.replace("Z", "+00:00")).strftime("%B %-d, %Y")
    manifest = {
        "export_date": export_date,
        "export_version": meta["export_version"],
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "attribution": (
            "This information is based on competition results owned and maintained by the "
            f"World Cube Association, published at https://worldcubeassociation.org/results as of {date_label}."
        ),
        "events": events,
        "files": files,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def rows_as_dicts(con: duckdb.DuckDBPyConnection, query: str) -> list[dict]:
    cur = con.execute(query)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--zip", type=Path, help="use this local TSV export zip instead of downloading")
    ap.add_argument("--force", action="store_true", help="rebuild even if the export did not change")
    args = ap.parse_args()

    meta = fetch_json(EXPORT_API)
    if not meta["export_version"].startswith(SUPPORTED_MAJOR + "."):
        print(f"Unsupported export version {meta['export_version']}; review the pipeline.", file=sys.stderr)
        return 2

    current = read_manifest(args.out)
    if current and current.get("export_date") == meta["export_date"] and not args.force:
        print(f"Up to date (export {meta['export_date']}).")
        set_github_output(changed="false", export_date=meta["export_date"])
        return 0

    with tempfile.TemporaryDirectory(prefix="cube_charts_") as tmp:
        tmp_path = Path(tmp)
        zip_path = args.zip
        if zip_path is None:
            zip_path = tmp_path / "export.zip"
            print(f"Downloading {meta['tsv_url']} ...")
            download(meta["tsv_url"], zip_path)
        tsv_dir = tmp_path / "tsv"
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tsv_dir)
        # Trust the export's own metadata for the date when building from a local zip.
        export_meta = json.loads((tsv_dir / "metadata.json").read_text())
        if not export_meta["export_format_version"].startswith(SUPPORTED_MAJOR + "."):
            print(f"Unsupported export version {export_meta['export_format_version']}.", file=sys.stderr)
            return 2
        meta = {
            "export_date": export_meta["export_date"].replace(" UTC", "Z").replace(" ", "T"),
            "export_version": export_meta["export_format_version"],
        }

        # Build into a staging folder, then swap, so a failed build never
        # leaves a half-written data folder behind.
        staging = tmp_path / "out"
        staging.mkdir()
        con_manifest = build(tsv_dir, staging, meta)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        if args.out.exists():
            # Only replace a folder this script created.
            if not (args.out / "manifest.json").exists():
                print(f"{args.out} exists and has no manifest.json; refusing to overwrite.", file=sys.stderr)
                return 1
            shutil.rmtree(args.out)
        shutil.copytree(staging, args.out)

    total = sum(con_manifest["files"].values())
    print(f"Built export {meta['export_date']}: {len(con_manifest['files'])} files, {total / 2**20:.1f} MiB")
    set_github_output(changed="true", export_date=meta["export_date"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
