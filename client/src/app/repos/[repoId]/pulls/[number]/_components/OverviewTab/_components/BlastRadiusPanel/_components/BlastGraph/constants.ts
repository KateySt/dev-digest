import type { CSSProperties } from "react";

/**
 * Node color per graph column, shared between `helpers.ts`'s node styles and
 * `BlastGraph`'s legend — a single source of truth so the two can't drift
 * out of sync (previously each held its own hardcoded copy of these colors).
 */
export const NODE_COLOR_SYMBOL = "var(--accent)";
export const NODE_COLOR_CALLER = "var(--border-strong)";
export const NODE_COLOR_TARGET = "var(--accent)";

/** Legend dot class per column — the same colours as above, as utilities. */
export const NODE_DOT_CLASS = {
  symbol: "bg-primary",
  caller: "bg-border-strong",
  target: "bg-primary",
} as const;

/**
 * Per-node styles passed through React Flow's node `style` API, keyed to the
 * theme CSS vars. React Flow's own default node CSS (white bg, dark text) is
 * unlayered, so it beats Tailwind's layered utilities and would leave labels
 * invisible on the dark theme — a style object on the node wins instead.
 */
const NODE_STYLE_BASE: CSSProperties = {
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
};
export const NODE_STYLE_SYMBOL: CSSProperties = {
  ...NODE_STYLE_BASE,
  border: `1.5px solid ${NODE_COLOR_SYMBOL}`,
  fontWeight: 600,
};
export const NODE_STYLE_CALLER: CSSProperties = {
  ...NODE_STYLE_BASE,
  border: `1px solid ${NODE_COLOR_CALLER}`,
};
export const NODE_STYLE_TARGET: CSSProperties = {
  ...NODE_STYLE_BASE,
  border: `1px solid ${NODE_COLOR_TARGET}`,
};
export const EDGE_STYLE: CSSProperties = { stroke: "var(--border-strong)" };
