import type { CSSProperties } from "react";

/** Co-located styles for TargetStep. */
export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  card: (selected: boolean, disabled: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    minWidth: 0,
    borderRadius: 10,
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--accent-bg)" : "var(--bg-surface)",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "default",
  }),
  cardTop: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  iconBox: {
    width: 28,
    height: 28,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    background: "var(--bg-hover)",
    flexShrink: 0,
  } satisfies CSSProperties,
  cardTitle: { flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  cardDesc: { fontSize: 12.5, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
