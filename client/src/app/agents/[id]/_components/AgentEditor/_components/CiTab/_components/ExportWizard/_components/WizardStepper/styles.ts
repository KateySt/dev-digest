import type { CSSProperties } from "react";

/** Co-located styles for WizardStepper. */
export const s = {
  list: { display: "flex", alignItems: "center", listStyle: "none", margin: 0, padding: "0 5px" } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  dot: (done: boolean, current: boolean): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    background: done ? "var(--ok)" : current ? "var(--accent)" : "var(--bg-elevated)",
    color: done || current ? "#fff" : "var(--text-muted)",
    border: done || current ? "none" : "1px solid var(--border-strong)",
  }),
  label: (done: boolean, current: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: current ? 600 : 500,
    color: done || current ? "var(--text-primary)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  }),
  line: (done: boolean): CSSProperties => ({
    flex: 1,
    height: 1,
    minWidth: 24,
    margin: "0 14px",
    background: done ? "var(--ok)" : "var(--border-strong)",
  }),
} as const;
