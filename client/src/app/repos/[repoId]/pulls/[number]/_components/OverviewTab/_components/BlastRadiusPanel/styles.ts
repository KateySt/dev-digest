import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  // Stats and the Tree/Graph toggle share one row (space-between) rather than
  // stacking as two rows — matches a single breadcrumb-style header bar
  // instead of a stat line followed by a separate toggle line.
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
    gap: 16,
  } satisfies CSSProperties,
  stat: {
    fontSize: 13,
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  // Leading icon per stat (symbols/callers/endpoints/crons) — decorative only,
  // the text label right next to it already conveys the meaning, so callers
  // mark it `aria-hidden` at the call site.
  statIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
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
