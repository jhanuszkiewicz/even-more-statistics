// Site root: this module sits one level below it, both in dev (src/) and in the build (assets/).
const ROOT = new URL(/* @vite-ignore */ "../", import.meta.url);

/** Absolute URL of a data file, so DuckDB can read it with HTTP range requests. */
export function dataUrl(rel: string): string {
  return new URL(`data/${rel}`, ROOT).href;
}

export async function fetchJson<T>(rel: string): Promise<T> {
  const resp = await fetch(dataUrl(rel));
  if (!resp.ok) throw new Error(`${rel}: HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}
