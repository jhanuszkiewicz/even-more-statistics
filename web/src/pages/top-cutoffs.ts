import * as Plot from "@observablehq/plot";
import { fetchJson } from "../data";
import { type Kind, formatResult, toValue, unitLabel } from "../format";
import { $, bindSelect, fillEventSelect, runPage, setParams, show, width, type Lookups } from "../site";

/** One series of aggregates/top_cutoffs/<event>.json. */
interface Series {
  region: string; // "world", a continent id or a country id
  kind: Kind;
  n: number; // 10 or 100
  years: number[];
  values: number[]; // raw results
}

// 1982 was a one-off World Championship; regular competitions start in 2003.
const FIRST_YEAR = 2003;

/** World, then continents and countries that have a series. */
function fillRegionSelect(sel: HTMLSelectElement, lookups: Lookups, regions: Set<string>, wanted: string) {
  const opts: HTMLElement[] = [new Option("World", "world")];
  const groups: [string, { id: string; name: string }[]][] = [
    ["Continents", lookups.continents],
    ["Countries", lookups.countries],
  ];
  for (const [label, items] of groups) {
    const group = document.createElement("optgroup");
    group.label = label;
    group.append(...items.filter((i) => regions.has(i.id)).map((i) => new Option(i.name, i.id)));
    opts.push(group);
  }
  sel.replaceChildren(...opts);
  sel.value = regions.has(wanted) ? wanted : "world";
}

runPage(async ({ lookups, eventById, currentEvents }) => {
  const evSel = $<HTMLSelectElement>("tc-event");
  const kindSel = $<HTMLSelectElement>("tc-kind");
  const regionSel = $<HTMLSelectElement>("tc-region");
  fillEventSelect(evSel, currentEvents);
  bindSelect(evSel, "event");
  bindSelect(kindSel, "kind");
  // Region options depend on the event and kind, so the URL value is applied on every refill.
  let region = new URLSearchParams(location.search).get("region") ?? "world";
  regionSel.addEventListener("change", () => {
    region = regionSel.value;
    setParams({ region });
  });

  const cache = new Map<string, Promise<Series[]>>();
  const load = (ev: string) => {
    if (!cache.has(ev)) cache.set(ev, fetchJson<Series[]>(`aggregates/top_cutoffs/${ev}.json`));
    return cache.get(ev)!;
  };

  const el = $("chart-tc");
  let token = 0;
  const render = async (refillRegions: boolean) => {
    const ev = eventById.get(evSel.value)!;
    const kind = kindSel.value as Kind;
    const mine = ++token;
    const all = await load(ev.id);
    if (mine !== token) return; // a newer selection is already rendering
    const series = all.filter((s) => s.kind === kind);
    if (refillRegions) fillRegionSelect(regionSel, lookups, new Set(series.map((s) => s.region)), region);
    const rows = series
      .filter((s) => s.region === regionSel.value)
      .flatMap((s) => s.years.map((year, i) => ({
        year,
        value: toValue(ev, s.values[i], kind),
        label: formatResult(ev, s.values[i], kind),
        place: `${s.n}th place`,
      })))
      .filter((d) => d.year >= FIRST_YEAR);
    if (rows.length === 0) {
      el.textContent = `No ${kind} rankings for ${ev.name} in this region.`;
      return;
    }
    show(el, Plot.plot({
      width: width(el),
      height: 340,
      marginLeft: 60,
      x: { label: null, tickFormat: "d" },
      y: { label: unitLabel(ev), grid: true },
      color: { legend: true, domain: ["10th place", "100th place"] },
      marks: [
        Plot.lineY(rows, { x: "year", y: "value", stroke: "place", marker: "dot" }),
        Plot.tip(rows, Plot.pointer({ x: "year", y: "value", title: (d) => `${d.year}, ${d.place}: ${d.label}` })),
      ],
    }));
  };

  const refill = () => render(true).catch((err) => { el.textContent = `Failed to load data: ${(err as Error).message}`; });
  evSel.addEventListener("change", refill);
  kindSel.addEventListener("change", refill);
  regionSel.addEventListener("change", () => render(false));
  await render(true);
});
