import type { CSSProperties } from "react";

export const s = {
  wrap: {
    height: 320,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
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
