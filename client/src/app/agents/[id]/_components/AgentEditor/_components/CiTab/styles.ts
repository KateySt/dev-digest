import type { CSSProperties } from "react";

/** Co-located styles for CiTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 720, minWidth: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  headerText: { flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 0 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  addRepo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
