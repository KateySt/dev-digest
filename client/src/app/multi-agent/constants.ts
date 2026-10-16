import type { IconName } from "@/components/icon";

export interface AgentAccent {
  /** Arbitrary-property class that sets `--agent` to the accent colour; children
   *  use `text-(--agent)`, `border-(--agent)`, `bg-(--agent)/15` etc. */
  tone: string;
  icon: IconName;
}

/** Design accents: red shield, amber bolt, blue bulb, purple people, green layers. */
export const AGENT_ACCENTS: AgentAccent[] = [
  { tone: "[--agent:#ef4444]", icon: "Shield" },
  { tone: "[--agent:#f59e0b]", icon: "Zap" },
  { tone: "[--agent:#3b82f6]", icon: "Lightbulb" },
  { tone: "[--agent:#8b5cf6]", icon: "Users" },
  { tone: "[--agent:#10b981]", icon: "Layers" },
];

/** Agent-name keyword -> index into AGENT_ACCENTS (first match wins). */
export const ACCENT_KEYWORDS: readonly (readonly [RegExp, number])[] = [
  [/secur/i, 0],
  [/perf/i, 1],
  [/test|junior/i, 2],
  [/api|contract|customer/i, 3],
  [/architect/i, 4],
];
