import type { CSSProperties } from "react";

/** Co-located styles for CiTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 700 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start" } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  noRepo: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  rowRepo: { flex: 1, fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  rowMeta: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
