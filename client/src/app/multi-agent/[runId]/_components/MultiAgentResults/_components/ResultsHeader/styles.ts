import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  topRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    padding: 2,
    gap: 2,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  toggleBtn: (on: boolean): CSSProperties => ({
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: on ? 600 : 500,
    cursor: "pointer",
    color: on ? "var(--text-primary)" : "var(--text-muted)",
    background: on ? "var(--bg-hover)" : "transparent",
  }),
  bottomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  pr: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 } satisfies CSSProperties,
  prNum: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  prTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
};
