import type { CSSProperties } from "react";

/** Co-located styles for RecentCiRuns. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  pr: { flex: 1, minWidth: 0, fontSize: 12.5, overflowWrap: "anywhere" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
