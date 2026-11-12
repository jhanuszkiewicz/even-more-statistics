import * as Plot from "@observablehq/plot";
import { fetchJson } from "../data";
import { $, runPage, show, width } from "../site";

interface CompetitionsPerYear { year: number; continent_id: string; competitions: number }

// Competitions per year, stacked by continent.
runPage(async ({ lookups }) => {
  const continentName = new Map(lookups.continents.map((c) => [c.id, c.name]));
  const comps = await fetchJson<CompetitionsPerYear[]>("aggregates/competitions_per_year.json");
  const el = $("chart-competitions");
  show(el, Plot.plot({
    width: width(el),
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
});
