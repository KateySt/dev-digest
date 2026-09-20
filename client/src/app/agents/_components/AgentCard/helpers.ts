import type { AgentPerfRow } from "@devdigest/shared";
import { formatRunCost } from "../../../../components/run-cost-badge";
import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** "142 runs · 78% accept · $0.04 avg" — omits accept-rate/avg-cost when
 *  there's nothing to show yet (no acted findings / no priced runs), and the
 *  whole line when there are zero runs. */
export function perfLine(
  perf: AgentPerfRow,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (perf.runs === 0) return null;
  const parts = [t("card.runsCount", { count: perf.runs })];
  if (perf.accept_rate != null) {
    parts.push(t("card.acceptRate", { pct: Math.round(perf.accept_rate * 100) }));
  }
  if (perf.avg_cost_usd != null) {
    parts.push(t("card.avgCost", { cost: formatRunCost(perf.avg_cost_usd) }));
  }
  return parts.join(" · ");
}
