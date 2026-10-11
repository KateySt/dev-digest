import type { IconName } from "@devdigest/ui";

export interface AgentAccent {
  color: string;
  icon: IconName;
}

/** Design accents: red shield, amber bolt, blue bulb, purple people, green layers. */
export const AGENT_ACCENTS: AgentAccent[] = [
  { color: "#ef4444", icon: "Shield" },
  { color: "#f59e0b", icon: "Zap" },
  { color: "#3b82f6", icon: "Lightbulb" },
  { color: "#8b5cf6", icon: "Users" },
  { color: "#10b981", icon: "Layers" },
];

/** Agent-name keyword -> index into AGENT_ACCENTS (first match wins). */
export const ACCENT_KEYWORDS: readonly (readonly [RegExp, number])[] = [
  [/secur/i, 0],
  [/perf/i, 1],
  [/test|junior/i, 2],
  [/api|contract|customer/i, 3],
  [/architect/i, 4],
];
