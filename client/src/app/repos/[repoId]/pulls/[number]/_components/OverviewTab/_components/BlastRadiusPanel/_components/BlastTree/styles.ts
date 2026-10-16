import type { CSSProperties } from "react";

// Horizontal offset of the caller tree's guide line inside `detail`.
const GUIDE_X = 8;

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  // Flat row (no border/box) — an open group gets the --bg-hover tint so the
  // expanded symbol reads as the "selected" header of its caller list.
  symbolRow: (interactive: boolean, open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 6px",
    borderRadius: 6,
    background: open ? "var(--bg-hover)" : "transparent",
    cursor: interactive ? "pointer" : "default",
    opacity: interactive ? 1 : 0.65,
  }),
  chevronSlot: {
    width: 13,
    display: "inline-flex",
    justifyContent: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
  codeIcon: {
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  callerCount: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginLeft: "auto",
    flexShrink: 0,
  } satisfies CSSProperties,
  detail: {
    padding: "4px 0 8px 14px",
  } satisfies CSSProperties,
  // A `file:line` string has no spaces, so the browser treats it as one
  // unbreakable "word" — minWidth: 0 on the row plus MonoLink's `wrap` give
  // it somewhere to break (see client/INSIGHTS.md's unbreakable file:line
  // entry).
  callerRow: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "3px 0",
    paddingLeft: 18,
    fontSize: 12.5,
    minWidth: 0,
  } satisfies CSSProperties,
  guideV: (last: boolean): CSSProperties => ({
    position: "absolute",
    left: GUIDE_X,
    top: 0,
    bottom: last ? "50%" : 0,
    width: 1,
    background: "var(--border-strong)",
  }),
  guideH: {
    position: "absolute",
    left: GUIDE_X,
    top: "50%",
    width: 8,
    height: 1,
    background: "var(--border-strong)",
  } satisfies CSSProperties,
  callerIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 0 2px 18px",
  } satisfies CSSProperties,
  cronRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "6px 0 2px 18px",
  } satisfies CSSProperties,
  // Badge (vendored, do-not-touch) hardcodes `white-space: nowrap`; override
  // it via its `style` prop so a long endpoint path / cron name wraps inside
  // the chip instead of running past the panel edge.
  chip: {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
