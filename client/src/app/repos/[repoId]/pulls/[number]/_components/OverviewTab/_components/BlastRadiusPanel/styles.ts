import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  // Stats and the Tree/Graph toggle share one row — stats on the left, the
  // segmented toggle pushed right.
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  } satisfies CSSProperties,
  stat: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  statValue: {
    fontWeight: 650,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  // Leading icon per stat (symbols/callers/endpoints/crons) — decorative only,
  // the text label right next to it already conveys the meaning, so callers
  // mark it `aria-hidden` at the call site.
  statIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  segmented: {
    display: "flex",
    gap: 2,
    marginLeft: "auto",
    padding: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    flexShrink: 0,
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    padding: "3px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
  placeholderHint: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // Separates the blast body from the "Prior PRs touching these files"
  // sub-section below it (see BlastRadiusPanel.tsx) — same token as
  // `OverviewTab/styles.ts#divider`, colocated rather than cross-imported
  // (each panel owns its own style tokens).
  divider: {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "16px 0",
  } satisfies CSSProperties,
} as const;
