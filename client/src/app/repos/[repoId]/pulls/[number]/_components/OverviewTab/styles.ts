import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    // minmax(0, 1fr), not bare 1fr — a bare `1fr` track's minimum width is
    // its content's max-content size, so an unbreakable long monospace path
    // (file:line, `white-space: nowrap`) inside a column blows the track
    // past the panel width instead of triggering the child's own
    // text-overflow: ellipsis. minmax(0, 1fr) makes the fraction win.
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
  gridCol: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
