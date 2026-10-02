import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  searchRow: { display: "flex", gap: 8, marginBottom: 4 } satisfies CSSProperties,
  activeFilter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginBottom: 10,
  } satisfies CSSProperties,
  clearFilterBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontSize: 12.5,
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  loadingWrap: { display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" } satisfies CSSProperties,
  settingsLink: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
} as const;
