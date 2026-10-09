import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  row: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: open ? "var(--bg-hover)" : "var(--bg-elevated)",
    cursor: "pointer",
  }),
  // Right-pointing when collapsed, rotates open — intentionally a different
  // idiom from BlastTree's down-chevron (see ReviewFocusList.tsx header
  // comment / the Development Plan this implements).
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    marginTop: 2,
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  // fileRef + description used to share one flex line, so a long path left
  // the description almost no width and it wrapped word-by-word in a
  // cramped column. Stacking them (this wrapper) gives the description the
  // full row width to wrap into instead.
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  // A `file:line` string has no spaces, so a plain box won't wrap it — the
  // browser treats it as one unbreakable "word" and runs it past the row
  // edge instead (client/INSIGHTS.md's "unbreakable mono file:line" entry —
  // this is call site #4). overflowWrap/wordBreak give it somewhere to
  // break; minWidth: 0 lets the box actually shrink first. Applied as a
  // per-call-site wrapping div (not a MonoLink prop) per that entry's
  // guidance, since MonoLink itself is vendored/do-not-touch.
  fileRef: {
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  descriptionRow: {
    display: "flex",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  dash: {
    color: "var(--text-muted)",
    fontSize: 13,
    flexShrink: 0,
  } satisfies CSSProperties,
  description: {
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    minWidth: 0,
  } satisfies CSSProperties,
  detail: {
    marginTop: 4,
    marginLeft: 22,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  detailText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  placeholderHint: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
