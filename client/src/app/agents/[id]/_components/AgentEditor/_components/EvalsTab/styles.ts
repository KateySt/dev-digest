import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 } satisfies CSSProperties,
  tileRow: { display: "flex", gap: 14 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 4 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  rowName: { flex: 1, fontSize: 14, fontWeight: 600, cursor: "pointer" } satisfies CSSProperties,
  rowMeta: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 6 } satisfies CSSProperties,
} as const;
