import type { MemoryInputScope, MemoryKind } from "@devdigest/shared";

export const MEMORY_KINDS: MemoryKind[] = ["decision", "convention", "preference", "fact", "learning"];
/** `team` is never offered (no team entity — SPEC-2026-10-12-memory non-goal). */
export const MEMORY_SCOPES: MemoryInputScope[] = ["repo", "global"];
export const SEARCH_DEBOUNCE_MS = 300;
/** Confidence dot thresholds (design: green ≥ 85%, amber ≥ 60%). */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MID = 0.6;

/** Confidence tone → dot / text colour classes. */
export const CONFIDENCE_TONE_CLASS: Record<"high" | "mid" | "low", { text: string; dot: string }> = {
  high: { text: "text-ok", dot: "bg-ok" },
  mid: { text: "text-warn", dot: "bg-warn" },
  low: { text: "text-subtle-foreground", dot: "bg-subtle-foreground" },
};

/** Class names shared by the Memory page parts and the Curate drawer. */
export const MEMORY_CLASSES = {
  /** Right-hand detail column (also its empty placeholder). */
  detail: "flex min-w-0 flex-col gap-4.5 overflow-y-auto border-l border-border px-5.5 py-5",
  badge: "rounded-[5px] border border-border-strong px-2 py-0.5 text-xs font-semibold text-muted-foreground",
  warnBadge: "rounded-[5px] border border-warn px-2 py-0.5 text-xs font-semibold text-warn",
  prChip: "mono rounded-[5px] bg-elevated px-1.75 py-0.5 text-xs text-primary",
  sectionLabel: "text-2xs font-semibold tracking-[0.6px] text-subtle-foreground uppercase",
  content: "min-w-0 text-base leading-[1.55] wrap-anywhere",
  chipRow: "flex flex-wrap gap-1.5",
  rowEnd: "flex justify-end gap-2",
  confirm: "flex flex-col gap-2.5 rounded-lg border border-crit p-3 text-sm",
  muted: "text-sm text-subtle-foreground",
} as const;
