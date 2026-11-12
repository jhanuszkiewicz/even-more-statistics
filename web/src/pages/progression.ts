import * as Plot from "@observablehq/plot";
import { dataUrl } from "../data";
import { query } from "../db";
import { formatResult, lowerIsBetter, toValue, unitLabel } from "../format";
import { $, fillEventSelect, runPage, show, width } from "../site";

runPage(async ({ lookups, eventById }) => {
  // Competitor progression: live query in DuckDB-WASM against one event file.
  const personEvent = $<HTMLSelectElement>("person-event");
  fillEventSelect(personEvent, lookups.events);
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
});

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
