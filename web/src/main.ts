import * as Plot from "@observablehq/plot";
import { dataUrl, fetchJson, query } from "./db";
import { type EventInfo, type Kind, formatResult, lowerIsBetter, toValue, unitLabel } from "./format";

interface Manifest {
  export_date: string;
  attribution: string;
  events: string[];
}
interface Lookups {
  events: EventInfo[];
  continents: { id: string; name: string }[];
}
interface CompetitionsPerYear { year: number; continent_id: string; competitions: number }
interface CompetitorsPerYear { year: number; event_id: string; competitors: number }
interface Newcomers { year: number; newcomers: number }
interface Percentile { kind: Kind; event_id: string; pct: number; value: number }

// Mid-tone blue that reads on both light and dark backgrounds.
const ACCENT = "#4a7fe0";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function width(el: HTMLElement): number {
  return Math.max(320, Math.min(el.clientWidth || 940, 940));
}

function show(el: HTMLElement, node: Node) {
  el.replaceChildren(node);
}

function fillEventSelect(sel: HTMLSelectElement, events: EventInfo[], withAll = false) {
  const opts = events.map((e) => new Option(e.name, e.id));
  if (withAll) opts.unshift(new Option("All events", "*"));
  sel.replaceChildren(...opts);
}

async function main() {
  const [manifest, lookups] = await Promise.all([
    fetchJson<Manifest>("manifest.json"),
    fetchJson<Lookups>("lookups.json"),
  ]);
  $("export-date").textContent = `Data as of ${manifest.export_date.slice(0, 10)}.`;
  $("attribution").textContent = manifest.attribution;

  const events = lookups.events;
  const eventById = new Map(events.map((e) => [e.id, e]));
  const continentName = new Map(lookups.continents.map((c) => [c.id, c.name]));
  // Current events first; retired ones (rank >= 990 in the export) after them.
  const currentEvents = events.filter((e) => e.rank < 990);

  // Competitions per year, stacked by continent.
  const comps = await fetchJson<CompetitionsPerYear[]>("aggregates/competitions_per_year.json");
  const compEl = $("chart-competitions");
  show(compEl, Plot.plot({
    width: width(compEl),
    height: 340,
    marginLeft: 50,
    x: { label: null, tickFormat: "d", interval: 1 },
    y: { label: "competitions", grid: true },
    color: { legend: true, scheme: "tableau10" },
    marks: [
      Plot.barY(comps, {
        x: "year", y: "competitions",
        fill: (d: CompetitionsPerYear) => continentName.get(d.continent_id) ?? d.continent_id,
        tip: true,
      }),
      Plot.ruleY([0]),
    ],
  }));

  // Competitors per year (distinct people), with newcomers for "All events".
  const [competitors, newcomers] = await Promise.all([
    fetchJson<CompetitorsPerYear[]>("aggregates/competitors_per_year.json"),
    fetchJson<Newcomers[]>("aggregates/newcomers_per_year.json"),
  ]);
  const cpySel = $<HTMLSelectElement>("cpy-event");
  fillEventSelect(cpySel, events, true);
  const renderCompetitors = () => {
    const ev = cpySel.value;
    const rows = competitors
      .filter((d) => d.event_id === ev)
      .map((d) => ({ year: d.year, value: d.competitors, series: "competitors" }));
    if (ev === "*") rows.push(...newcomers.map((d) => ({ year: d.year, value: d.newcomers, series: "first competition" })));
    const el = $("chart-competitors");
    show(el, Plot.plot({
      width: width(el),
      height: 300,
      marginLeft: 60,
      x: { label: null, tickFormat: "d" },
      y: { label: "people", grid: true },
      color: { legend: ev === "*" },
      marks: [
        Plot.lineY(rows, { x: "year", y: "value", stroke: "series", marker: "dot", tip: true }),
        Plot.ruleY([0]),
      ],
    }));
  };
  cpySel.addEventListener("change", renderCompetitors);
  renderCompetitors();

  // Personal best distribution (percentiles computed in the pipeline).
  const pcts = await fetchJson<Percentile[]>("aggregates/personal_best_percentiles.json");
  const pbEvent = $<HTMLSelectElement>("pb-event");
  const pbKind = $<HTMLSelectElement>("pb-kind");
  fillEventSelect(pbEvent, currentEvents);
  const renderPb = () => {
    const ev = eventById.get(pbEvent.value)!;
    const kind = pbKind.value as Kind;
    const rows = pcts
      .filter((d) => d.event_id === ev.id && d.kind === kind)
      .map((d) => ({ pct: d.pct, value: toValue(ev, d.value, kind), label: formatResult(ev, d.value, kind) }));
    const el = $("chart-pb");
    if (rows.length === 0) {
      el.textContent = `No ${kind} rankings for ${ev.name}.`;
      return;
    }
    show(el, Plot.plot({
      width: width(el),
      height: 320,
      marginLeft: 60,
      x: { label: "competitors (%)", domain: [0, 100] },
      y: { label: unitLabel(ev), grid: true },
      marks: [
        Plot.lineY(rows, { x: "pct", y: "value", stroke: ACCENT }),
        Plot.dot(rows, Plot.pointerX({ x: "pct", y: "value", fill: ACCENT })),
        Plot.tip(rows, Plot.pointerX({ x: "pct", y: "value", title: (d) => `${d.pct}% of competitors: ${d.label} or better` })),
      ],
    }));
  };
  pbEvent.addEventListener("change", renderPb);
  pbKind.addEventListener("change", renderPb);
  renderPb();

  // Competitor progression: live query in DuckDB-WASM against one event file.
  const personEvent = $<HTMLSelectElement>("person-event");
  fillEventSelect(personEvent, events);
  const status = $("person-status");
  const personEl = $("chart-person");
  $<HTMLFormElement>("person-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $<HTMLInputElement>("person-id").value.trim().toUpperCase();
    const ev = eventById.get(personEvent.value)!;
    status.textContent = "Loading…";
    personEl.replaceChildren();
    try {
      const [person] = await query<{ name: string; country_id: string }>(
        `SELECT name, country_id FROM read_parquet('${dataUrl("persons.parquet")}') WHERE wca_id = ?`, [id]);
      if (!person) {
        status.textContent = `No competitor with WCA ID ${id}.`;
        return;
      }
      const rows = await query<{ date: number; competition_id: string; best: number; average: number }>(
        `SELECT date, competition_id, best, average
         FROM read_parquet('${dataUrl(`results/${ev.id}.parquet`)}')
         WHERE person_id = ? ORDER BY date`, [id]);
      if (rows.length === 0) {
        status.textContent = `${person.name} has no ${ev.name} results.`;
        return;
      }
      const points = rows.flatMap((r) => {
        const date = new Date(r.date);
        const out = [];
        const s = toValue(ev, r.best, "single");
        const a = toValue(ev, r.average, "average");
        if (s != null) out.push({ date, value: s, kind: "single", label: formatResult(ev, r.best, "single"), comp: r.competition_id });
        if (a != null) out.push({ date, value: a, kind: "average", label: formatResult(ev, r.average, "average"), comp: r.competition_id });
        return out;
      });
      status.textContent = `${person.name} (${person.country_id}) — ${rows.length} rounds of ${ev.name}.`;
      if (points.length === 0) {
        personEl.textContent = "No successful results.";
        return;
      }
      show(personEl, Plot.plot({
        width: width(personEl),
        height: 340,
        marginLeft: 60,
        x: { label: null, type: "utc" },
        y: { label: unitLabel(ev), grid: true },
        color: { legend: true, domain: ["single", "average"] },
        marks: [
          Plot.dot(points, { x: "date", y: "value", stroke: "kind", r: 2.5, tip: true,
            title: (d) => `${d.comp}\n${d.kind}: ${d.label}` }),
          Plot.line(pbSteps(points, "single", lowerIsBetter(ev)), { x: "date", y: "value", stroke: "kind", curve: "step-after" }),
          Plot.line(pbSteps(points, "average", lowerIsBetter(ev)), { x: "date", y: "value", stroke: "kind", curve: "step-after" }),
        ],
      }));
    } catch (err) {
      status.textContent = `Query failed: ${(err as Error).message}`;
    }
  });
}

/** Running personal best for one kind, as points for a step line. */
function pbSteps<T extends { date: Date; value: number; kind: string }>(points: T[], kind: string, lower: boolean) {
  let best: number | null = null;
  const out: { date: Date; value: number; kind: string }[] = [];
  for (const p of points) {
    if (p.kind !== kind) continue;
    if (best == null || (lower ? p.value < best : p.value > best)) {
      best = p.value;
      out.push({ date: p.date, value: best, kind });
    }
  }
  if (out.length > 0) out.push({ ...out[out.length - 1], date: points[points.length - 1].date });
  return out;
}

main().catch((err) => {
  document.querySelector("main")!.textContent = `Failed to load data: ${(err as Error).message}`;
});
