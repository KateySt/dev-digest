import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  headerIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  headerLabel: {
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  spacer: {
    flex: 1,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  placeholderHint: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    // A PR title is free-form text with no guaranteed spaces (long
    // identifiers, paths pasted into a title, …) — same overflow bug as the
    // mono file:line strings elsewhere in this panel family (see
    // client/INSIGHTS.md's "unbreakable mono file:line string" entry, three
    // prior occurrences). minWidth: 0 lets this flex item actually shrink.
    minWidth: 0,
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
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  itemNotes: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 4,
  } satisfies CSSProperties,
  // A `file/path.ts` string has no spaces, so the browser treats it as one
  // unbreakable "word" — give each row its own wrap room (same fix as
  // BlastTree's `callerItem` / CommitHistoryPanel's file rows).
  fileRow: {
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
