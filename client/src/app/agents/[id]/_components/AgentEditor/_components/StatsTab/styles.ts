import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 28, maxWidth: 900 } satisfies CSSProperties,
  tileRow: { display: "flex", gap: 14 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 12 } satisfies CSSProperties,
  emptyNote: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "0 10px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: {
    fontSize: 13,
    padding: "10px 10px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  viewTraceBtn: {
    fontSize: 12.5,
    color: "var(--accent)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
} as const;
