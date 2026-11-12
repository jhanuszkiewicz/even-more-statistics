// Conversion of raw WCA result values into numbers for charts and text for labels.
// Raw values: centiseconds for timed events; 333fm single = moves, average = moves * 100;
// 333mbf/333mbo use a packed encoding. -1 = DNF, -2 = DNS, 0 = no result.

export type Kind = "single" | "average";

export interface EventInfo {
  id: string;
  name: string;
  format: "time" | "number" | "multi";
  rank: number;
}

/** Plot value: seconds for timed events, moves for FMC, points for multi-blind. */
export function toValue(ev: EventInfo, raw: number, kind: Kind): number | null {
  if (raw <= 0) return null;
  if (ev.format === "time") return raw / 100;
  if (ev.format === "number") return kind === "average" ? raw / 100 : raw;
  return decodeMulti(raw).points;
}

export function unitLabel(ev: EventInfo): string {
  if (ev.format === "time") return "time (s)";
  if (ev.format === "number") return "moves";
  return "points";
}

/** Higher is better only for multi-blind points. */
export function lowerIsBetter(ev: EventInfo): boolean {
  return ev.format !== "multi";
}

export function formatResult(ev: EventInfo, raw: number, kind: Kind): string {
  if (raw === -1) return "DNF";
  if (raw === -2) return "DNS";
  if (raw === 0) return "";
  if (ev.format === "time") return formatSeconds(raw / 100);
  if (ev.format === "number") return kind === "average" ? (raw / 100).toFixed(2) : String(raw);
  const m = decodeMulti(raw);
  return `${m.solved}/${m.attempted} ${m.seconds == null ? "" : formatSeconds(m.seconds, false)}`.trim();
}

export function formatSeconds(s: number, cs = true): string {
  const minutes = Math.floor(s / 60);
  const rest = s - minutes * 60;
  const sec = cs ? rest.toFixed(2) : String(Math.round(rest));
  if (minutes === 0) return sec;
  return `${minutes}:${sec.padStart(cs ? 5 : 2, "0")}`;
}

/** 333mbf: 0DDTTTTTMM; 333mbo (old): 1SSAATTTTT. */
export function decodeMulti(raw: number) {
  if (raw >= 1_000_000_000) {
    const solved = 99 - Math.floor(raw / 10_000_000) % 100;
    const attempted = Math.floor(raw / 100_000) % 100;
    const t = raw % 100_000;
    return { solved, attempted, points: solved - (attempted - solved), seconds: t === 99999 ? null : t };
  }
  const dd = Math.floor(raw / 10_000_000);
  const t = Math.floor(raw / 100) % 100_000;
  const missed = raw % 100;
  const points = 99 - dd;
  const solved = points + missed;
  return { solved, attempted: solved + missed, points, seconds: t === 99999 ? null : t };
}
