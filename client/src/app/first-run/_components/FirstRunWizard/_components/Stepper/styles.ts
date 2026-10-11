import type { CSSProperties } from "react";

type StepState = "done" | "active" | "pending";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    listStyle: "none",
    margin: "0 0 28px",
    padding: 0,
  } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  line: { flex: 1, height: 1, background: "var(--border-strong)" } satisfies CSSProperties,
  dot: (state: StepState): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: 13,
    fontWeight: 600,
    color: state === "pending" ? "var(--text-muted)" : "#fff",
    background: state === "active" ? "var(--accent)" : state === "done" ? "var(--ok)" : "transparent",
    border: state === "pending" ? "1px solid var(--border-strong)" : "none",
  }),
  label: (state: StepState): CSSProperties => ({
    fontSize: 13,
    fontWeight: state === "active" ? 600 : 500,
    color: state === "active" ? "var(--text-primary)" : "var(--text-muted)",
  }),
} as const;
