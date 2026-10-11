import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 14, fontWeight: 600, margin: "0 0 10px", color: "var(--text-primary)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 8, textDecoration: "none",
    border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 13,
  } satisfies CSSProperties,
  label: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
};
