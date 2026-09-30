import type { CSSProperties } from "react";

/** Co-located styles for ContextDocumentRow. Path text always gets its own
 *  wrap room (client/INSIGHTS.md 2026-09-24) — `overflowWrap`/`wordBreak`/
 *  `minWidth: 0` on the text's own box, never relying on the row's flex
 *  alone. */
export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  row: (dragging: boolean, over: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid " + (over ? "var(--accent)" : "var(--border)"),
    background: "var(--bg-surface)",
    opacity: dragging ? 0.5 : 1,
    minWidth: 0,
  }),
  handle: (active: boolean): CSSProperties => ({
    color: active ? "var(--text-muted)" : "var(--text-muted)",
    opacity: active ? 1 : 0.35,
    cursor: active ? "grab" : "not-allowed",
    display: "inline-flex",
    flexShrink: 0,
  }),
  reorderButtons: { display: "inline-flex", flexDirection: "column", gap: 1, flexShrink: 0 } satisfies CSSProperties,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 1,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  pathBox: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  path: {
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "var(--font-mono, monospace)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  tagBadge: { flexShrink: 0, overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties,
  previewBtn: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 9px",
    cursor: "pointer",
  } satisfies CSSProperties,
  previewPane: {
    margin: "4px 0 0",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    fontSize: 13,
    maxHeight: 260,
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
