import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  info: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 } satisfies CSSProperties,
  version: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 6 } satisfies CSSProperties,
  diffPane: { display: "flex", gap: 12 } satisfies CSSProperties,
  diffCol: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  diffLabel: { fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  diffBody: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 420,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
