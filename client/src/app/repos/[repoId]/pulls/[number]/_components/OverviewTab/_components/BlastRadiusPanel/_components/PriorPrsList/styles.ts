import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
  } satisfies CSSProperties,
  header: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    cursor: "pointer",
    color: "var(--text-primary)",
    background: open ? "var(--bg-surface)" : "transparent",
  }),
  headerIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  headerLabel: {
    fontSize: 12.5,
    fontWeight: 600,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    marginLeft: "auto",
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  body: {
    borderTop: "1px solid var(--border)",
    padding: "4px 0",
  } satisfies CSSProperties,
  bodyPad: {
    padding: "8px 14px",
  } satisfies CSSProperties,
  placeholderHint: {
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  item: (last: boolean): CSSProperties => ({
    display: "flex",
    gap: 12,
    padding: "10px 14px",
    borderBottom: last ? "none" : "1px solid var(--border)",
    // A PR title / path is free-form text with no guaranteed spaces —
    // minWidth: 0 lets this flex item actually shrink (see client/INSIGHTS.md's
    // "unbreakable mono file:line string" entry).
    minWidth: 0,
  }),
  timeline: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 3,
  } satisfies CSSProperties,
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: "var(--text-muted)",
    border: "2px solid var(--bg-elevated)",
    boxSizing: "content-box",
  } satisfies CSSProperties,
  timelineLine: {
    width: 1,
    flex: 1,
    background: "var(--border)",
    marginTop: 2,
  } satisfies CSSProperties,
  itemBody: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  itemTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemNumber: {
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "4px 0 6px",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  itemNotes: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 6,
  } satisfies CSSProperties,
  fileRow: {
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
