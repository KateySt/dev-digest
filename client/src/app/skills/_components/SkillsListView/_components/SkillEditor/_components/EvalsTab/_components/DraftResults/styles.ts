import type { CSSProperties } from "react";

/** Co-located styles for DraftResults. Long case names / file:line summaries
 *  wrap (client/INSIGHTS.md 2026-09-24): overflowWrap + minWidth 0 on the text boxes. */
export const s = {
  wrap: {
    border: "1px dashed var(--warn)",
    borderRadius: 9,
    padding: "14px 16px",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  progress: { fontSize: 12.5, color: "var(--text-secondary)", marginLeft: "auto" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  failed: {
    fontSize: 13,
    color: "var(--crit)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  metrics: { display: "flex", gap: 24, flexWrap: "wrap" } satisfies CSSProperties,
  metric: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  metricLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  icon: { flexShrink: 0, display: "grid", placeItems: "center", width: 20 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 700, overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties,
  summary: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  outcome: { fontSize: 12, fontWeight: 600, flexShrink: 0 } satisfies CSSProperties,
} as const;
