import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  folder: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  folderHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 12px",
    background: "var(--bg-surface)",
    border: "none",
    cursor: "pointer",
    color: "var(--text-primary)",
    textAlign: "left",
  } satisfies CSSProperties,
  folderIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  folderName: { flex: 1, fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  folderCount: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    borderRadius: 999,
    padding: "1px 8px",
  } satisfies CSSProperties,
  entries: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
