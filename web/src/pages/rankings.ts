import { fetchJson } from "../data";
import { bindSelect, runPage, type Lookups } from "../site";

/** Shared row shape of every aggregates/ranking_*.json file. */
interface RankingRow {
  region: string; // "world", a continent id or a country id
  rank: number;
  person_id: string;
  name: string;
  country_id: string;
  value: number;
}

interface RankingInfo {
  /** Section anchor and URL parameter holding the selected region. */
  id: string;
  title: string;
  description: string;
  /** Aggregate file name without extension. */
  file: string;
  valueLabel: string;
}

// Adding a ranking: a pipeline/aggregates/ranking_*.sql with the shared columns + an entry here.
const RANKINGS: RankingInfo[] = [
  {
    id: "most-competitions",
    title: "Most competitions",
    description: "Competitions with at least one result. Region is the competitor's current country.",
    file: "ranking_most_competitions",
    valueLabel: "Competitions",
  },
];

const TOP = 20;

/** Creates an element with attributes and children. */
function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** World, then continents and countries that have rows in this ranking. */
function regionSelect(lookups: Lookups, regions: Set<string>): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.append(new Option("World", "world"));
  const groups: [string, { id: string; name: string }[]][] = [
    ["Continents", lookups.continents],
    ["Countries", lookups.countries],
  ];
  for (const [label, items] of groups) {
    const group = el("optgroup", { label });
    group.append(...items.filter((i) => regions.has(i.id)).map((i) => new Option(i.name, i.id)));
    sel.append(group);
  }
  return sel;
}

function table(info: RankingInfo, rows: RankingRow[], countryName: Map<string, string>): HTMLElement {
  // Ties at the cut-off can add many rows in small countries; show TOP and summarise the rest.
  const shown = rows.slice(0, TOP);
  const body = shown.map((r, i) => {
    const sameAsPrev = i > 0 && shown[i - 1].rank === r.rank;
    const link = el("a", { href: `https://www.worldcubeassociation.org/persons/${r.person_id}`, target: "_blank", rel: "noopener" }, r.name);
    return el("tr", {},
      el("td", { class: "num" }, sameAsPrev ? "" : String(r.rank)),
      el("td", {}, link),
      el("td", {}, countryName.get(r.country_id) ?? r.country_id),
      el("td", { class: "num" }, r.value.toLocaleString("en")),
    );
  });
  const head = el("tr", {}, el("th", { class: "num" }, "#"), el("th", {}, "Name"), el("th", {}, "Country"), el("th", { class: "num" }, info.valueLabel));
  const wrap = el("div", { class: "table-wrap" }, el("table", { class: "ranking" }, el("thead", {}, head), el("tbody", {}, ...body)));
  const rest = rows.length - shown.length;
  if (rest > 0) {
    const last = rows[rows.length - 1];
    wrap.append(el("p", { class: "hint" }, `…and ${rest} more tied at #${last.rank} (${last.value.toLocaleString("en")}).`));
  }
  return wrap;
}

runPage(async ({ lookups }) => {
  const data = await Promise.all(RANKINGS.map((r) => fetchJson<RankingRow[]>(`aggregates/${r.file}.json`)));
  const countryName = new Map(lookups.countries.map((c) => [c.id, c.name]));

  document.getElementById("toc")!.append(
    ...RANKINGS.map((r) => el("li", {}, el("a", { href: `#${r.id}` }, r.title))),
  );

  const container = document.getElementById("rankings")!;
  RANKINGS.forEach((info, i) => {
    const byRegion = new Map<string, RankingRow[]>();
    for (const r of data[i]) {
      const list = byRegion.get(r.region);
      if (list) list.push(r);
      else byRegion.set(r.region, [r]);
    }
    const sel = regionSelect(lookups, new Set(byRegion.keys()));
    bindSelect(sel, info.id);
    const out = el("div");
    const render = () => out.replaceChildren(table(info, byRegion.get(sel.value) ?? [], countryName));
    sel.addEventListener("change", render);
    render();
    container.append(el("section", { id: info.id },
      el("h2", {}, info.title),
      el("p", { class: "hint" }, info.description),
      el("div", { class: "controls" }, el("label", {}, "Region", sel)),
      out,
    ));
  });

  // Sections are created after load, so jump to the anchor once they exist.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
});
