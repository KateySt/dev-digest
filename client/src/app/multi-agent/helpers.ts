import { ACCENT_KEYWORDS, AGENT_ACCENTS, type AgentAccent } from "./constants";

/** Stable accent for an agent: keyword match on its name, else a hash of the name. */
export function resolveAccent(agentName: string | null | undefined): AgentAccent {
  const name = agentName ?? "";
  const hit = ACCENT_KEYWORDS.find(([re]) => re.test(name));
  if (hit) return AGENT_ACCENTS[hit[1]]!;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AGENT_ACCENTS[h % AGENT_ACCENTS.length]!;
}

/** "8.2s"; unknown renders a bare "—" (no unit). */
export const formatDuration = (ms: number | null | undefined): string =>
  ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;

/** >= $0.01 -> 2 decimals; sub-cent keeps 4 decimals ("$0.0003"); null -> "—". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd >= 0.01 || usd === 0) return `$${usd.toFixed(2)}`;
  const s = usd.toFixed(4);
  return Number(s) === 0 ? "<$0.0001" : `$${s}`;
}
