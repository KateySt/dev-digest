import type { AgentPerfRow, PerfCostSegment } from "@devdigest/shared";
import type { DonutSegment } from "@/components/charts";
import { SEGMENT_COLORS, type SortKey } from "./constants";

/** Assign a cycling color to each cost segment — the contract's
 *  `PerfCostSegment` has no color of its own. */
export function toDonutSegments(segments: PerfCostSegment[]): DonutSegment[] {
  return segments.map((s, i) => ({ ...s, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]! }));
}

/** Sort agent rows by the chosen key, descending; nulls (e.g. no acted
 *  findings yet → accept_rate: null) sort last regardless of direction. */
export function sortAgents(rows: AgentPerfRow[], key: SortKey): AgentPerfRow[] {
  const metricOf = (r: AgentPerfRow): number | null =>
    key === "acceptRate" ? r.accept_rate : key === "cost" ? r.total_cost_usd : r.runs;
  return [...rows].sort((a, b) => {
    const av = metricOf(a);
    const bv = metricOf(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}
