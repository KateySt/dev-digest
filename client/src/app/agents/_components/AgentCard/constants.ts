/** Constants for AgentCard. */

/** Model → chip text + tinted background. Unknown models fall back to MODEL_CHIP_FALLBACK. */
export const MODEL_CHIP: Record<string, string> = {
  "gpt-4.1": "bg-blue-500/10 text-blue-500",
  "gpt-4o": "bg-emerald-500/10 text-emerald-500",
  "gpt-4o-mini": "bg-violet-500/10 text-violet-500",
  o1: "bg-amber-500/10 text-amber-500",
};

export const MODEL_CHIP_FALLBACK = "bg-muted text-muted-foreground";
