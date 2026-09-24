import type { CSSProperties } from "react";

export const s = {
  // Wraps the canvas + the legend row below it.
  wrapOuter: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  wrap: {
    height: 320,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // Dot color is passed in per legend entry so it always matches the actual
  // node border color it explains (NODE_COLOR_SYMBOL/CALLER/TARGET in
  // ./constants) instead of a second hardcoded copy.
  legendDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
    flexShrink: 0,
  }),
  // React Flow's default zoom +/- buttons render tiny — scale the whole
  // control cluster up, anchored to the corner it's docked in so it doesn't
  // drift off the graph.
  controls: {
    transform: "scale(1.6)",
    transformOrigin: "bottom left",
  } satisfies CSSProperties,
  empty: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
