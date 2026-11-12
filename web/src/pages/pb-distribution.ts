import * as Plot from "@observablehq/plot";
import { fetchJson } from "../data";
import { type Kind, formatResult, toValue, unitLabel } from "../format";
import { $, ACCENT, bindSelect, fillEventSelect, runPage, show, width } from "../site";

interface Percentile { kind: Kind; event_id: string; pct: number; value: number }

// Personal best distribution (percentiles computed in the pipeline).
runPage(async ({ eventById, currentEvents }) => {
  const pcts = await fetchJson<Percentile[]>("aggregates/personal_best_percentiles.json");
  const pbEvent = $<HTMLSelectElement>("pb-event");
  const pbKind = $<HTMLSelectElement>("pb-kind");
  fillEventSelect(pbEvent, currentEvents);
  bindSelect(pbEvent, "event");
  bindSelect(pbKind, "kind");
  const render = () => {
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
  pbEvent.addEventListener("change", render);
  pbKind.addEventListener("change", render);
  render();
});
