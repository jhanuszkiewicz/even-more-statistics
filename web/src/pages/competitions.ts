import * as Plot from "@observablehq/plot";
import { fetchJson } from "../data";
import { $, runPage, show, width } from "../site";

interface CompetitionsPerYear { year: number; continent_id: string; competitions: number }

// 1982 was a one-off World Championship; regular competitions start in 2003.
const FIRST_YEAR = 2003;
// Not a continent: competitions held in several places at once. Counted in the world total only.
const MULTIPLE = "_Multiple Continents";

// Competitions per year: world total stacked by continent, then one chart per continent.
runPage(async ({ lookups }) => {
  const continentName = new Map(lookups.continents.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => continentName.get(id) ?? id;
  const comps = (await fetchJson<CompetitionsPerYear[]>("aggregates/competitions_per_year.json"))
    .filter((d) => d.year >= FIRST_YEAR);

  const lastYear = Math.max(...comps.map((d) => d.year));
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const totalByYear = new Map<number, number>();
  for (const d of comps) totalByYear.set(d.year, (totalByYear.get(d.year) ?? 0) + d.competitions);
  const totals = years.map((year) => ({ year, competitions: totalByYear.get(year) ?? 0 }));

  // Same continent → color mapping in every chart.
  const names = [...new Set(comps.map((d) => nameOf(d.continent_id)))].sort();
  const color = { domain: names, scheme: "tableau10" as const };
  const colorOf = Plot.scale({ color: { ...color, type: "ordinal" } });
  const x = { type: "band" as const, domain: years, label: null, tickFormat: "d", ticks: years.filter((y) => y % 5 === 0) };

  const el = $("chart-competitions");
  show(el, Plot.plot({
    width: width(el),
    height: 340,
    marginLeft: 50,
    x,
    y: { label: "competitions", grid: true },
    color: { ...color, legend: true },
    marks: [
      Plot.barY(comps, { x: "year", y: "competitions", fill: (d: CompetitionsPerYear) => nameOf(d.continent_id) }),
      // Invisible full-height bars carry the tooltip, so it shows the world total for the year.
      Plot.barY(totals, {
        x: "year", y: "competitions", fillOpacity: 0,
        title: (d: { year: number; competitions: number }) => `${d.year}\n${d.competitions.toLocaleString("en")} competitions worldwide`,
        tip: "x",
      }),
      Plot.ruleY([0]),
    ],
  }));

  const grid = $("continent-charts");
  const continentIds = [...new Set(comps.map((d) => d.continent_id))]
    .filter((id) => id !== MULTIPLE)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  grid.replaceChildren();
  for (const id of continentIds) {
    const name = nameOf(id);
    const byYear = new Map(comps.filter((d) => d.continent_id === id).map((d) => [d.year, d.competitions]));
    const rows = years.map((year) => ({ year, competitions: byYear.get(year) ?? 0 }));
    const box = document.createElement("div");
    const h = document.createElement("h3");
    h.textContent = name;
    const chart = document.createElement("div");
    chart.className = "chart";
    box.append(h, chart);
    grid.append(box); // attach first so width() can measure it
    show(chart, Plot.plot({
      width: width(chart),
      height: 220,
      marginLeft: 50,
      x,
      y: { label: "competitions", grid: true },
      marks: [
        Plot.barY(rows, { x: "year", y: "competitions", fill: colorOf.apply(name) as string, tip: { format: { x: (y: number) => String(y) } } }),
        Plot.ruleY([0]),
      ],
    }));
  }
});
