import * as Plot from "@observablehq/plot";
import { fetchJson } from "../data";
import { $, bindSelect, fillEventSelect, runPage, show, width } from "../site";

interface CompetitorsPerYear { year: number; event_id: string; competitors: number }
interface Newcomers { year: number; newcomers: number }

// Competitors per year (distinct people), with newcomers for "All events".
runPage(async ({ lookups }) => {
  const [competitors, newcomers] = await Promise.all([
    fetchJson<CompetitorsPerYear[]>("aggregates/competitors_per_year.json"),
    fetchJson<Newcomers[]>("aggregates/newcomers_per_year.json"),
  ]);
  const sel = $<HTMLSelectElement>("cpy-event");
  fillEventSelect(sel, lookups.events, true);
  bindSelect(sel, "event");
  const render = () => {
    const ev = sel.value;
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
  sel.addEventListener("change", render);
  render();
});
