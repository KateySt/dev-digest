import type { CSSProperties } from "react";

/** Entry paths have no spaces (e.g. "python/pytest-discipline.md") and will
 *  run past their container unless explicitly given a wrap opportunity —
 *  text-overflow: ellipsis alone does nothing here (client/INSIGHTS.md
 *  2026-09-24). `info`'s `minWidth: 0` is required alongside `path`'s own
 *  wrap properties, or the flex child's default `min-width: auto` prevents
 *  the wrap from ever kicking in. */
export const s = {
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  info: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  nameRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  folderLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  desc: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  path: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  tags: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 } satisfies CSSProperties,
} as const;
