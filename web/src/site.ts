import "./style.css";
import { fetchJson } from "./data";
import type { EventInfo } from "./format";

export interface Manifest {
  export_date: string;
  attribution: string;
  events: string[];
}
export interface Lookups {
  events: EventInfo[];
  continents: { id: string; name: string }[];
}
export interface Site {
  manifest: Manifest;
  lookups: Lookups;
  eventById: Map<string, EventInfo>;
  /** Current events; retired ones have rank >= 990 in the export. */
  currentEvents: EventInfo[];
}

// Mid-tone blue that reads on both light and dark backgrounds.
export const ACCENT = "#4a7fe0";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function width(el: HTMLElement): number {
  return Math.max(320, Math.min(el.clientWidth || 940, 940));
}

export function show(el: HTMLElement, node: Node) {
  el.replaceChildren(node);
}

export function fillEventSelect(sel: HTMLSelectElement, events: EventInfo[], withAll = false) {
  const opts = events.map((e) => new Option(e.name, e.id));
  if (withAll) opts.unshift(new Option("All events", "*"));
  sel.replaceChildren(...opts);
}

/** Updates query parameters in place (no history entry); empty values are removed. */
export function setParams(values: Record<string, string>) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(values)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  history.replaceState(null, "", url);
}

/**
 * Keeps a select in sync with a query parameter: the URL value is applied on load
 * when it is one of the options, and every change is written back to the URL.
 */
export function bindSelect(sel: HTMLSelectElement, param: string) {
  const value = new URLSearchParams(location.search).get(param);
  if (value != null && [...sel.options].some((o) => o.value === value)) sel.value = value;
  sel.addEventListener("change", () => setParams({ [param]: sel.value }));
}

/** Loads the shared data, fills the export date and attribution, then runs the page. */
export function runPage(page: (site: Site) => Promise<void>) {
  (async () => {
    const [manifest, lookups] = await Promise.all([
      fetchJson<Manifest>("manifest.json"),
      fetchJson<Lookups>("lookups.json"),
    ]);
    $("export-date").textContent = `Data as of ${manifest.export_date.slice(0, 10)}.`;
    $("attribution").textContent = manifest.attribution;
    await page({
      manifest,
      lookups,
      eventById: new Map(lookups.events.map((e) => [e.id, e])),
      currentEvents: lookups.events.filter((e) => e.rank < 990),
    });
  })().catch((err) => {
    document.querySelector("main")!.textContent = `Failed to load data: ${(err as Error).message}`;
  });
}
