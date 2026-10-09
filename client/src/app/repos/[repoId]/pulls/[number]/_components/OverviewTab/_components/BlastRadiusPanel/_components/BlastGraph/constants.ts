import type { CSSProperties } from "react";

/**
 * Node color per graph column, shared between `helpers.ts`'s node styles and
 * `BlastGraph`'s legend — a single source of truth so the two can't drift
 * out of sync (previously each held its own hardcoded copy of these colors).
 */
export const NODE_COLOR_SYMBOL = "var(--accent)";
export const NODE_COLOR_CALLER = "var(--border-strong)";
export const NODE_COLOR_TARGET = "var(--accent)";

/**
 * Explicit per-node inline styles, keyed to this app's dark-theme CSS vars.
 * React Flow's own default node CSS (white bg, dark text) reads as blank
 * boxes here — the app's global stylesheet cascade overrides its text color
 * without also overriding the background, so labels go invisible. An inline
 * `style` on the node wins over any cascade, so we set it explicitly instead
 * of fighting specificity.
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
