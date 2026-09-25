import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  symbolRow: (interactive: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    cursor: interactive ? "pointer" : "default",
    opacity: interactive ? 1 : 0.65,
  }),
  // Reserves the chevron's own width on every row (even non-expandable ones,
  // where nothing renders inside it) so the code icon/name/file columns line
  // up across rows regardless of whether a chevron is present.
  chevronSlot: {
    width: 14,
    display: "inline-flex",
    justifyContent: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  codeIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolFile: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  // Plain indented area (no box/background) — a left guideline rule plus a
  // per-caller connector icon (see callerItem) reads as a tree branch rather
  // than a bordered card nested inside another bordered card.
  detail: {
    marginLeft: 24,
    marginTop: 2,
    paddingLeft: 12,
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  // A caller line (`file:line — name`) has no spaces, so a plain flex item
  // won't wrap it — the browser treats it as one unbreakable "word" and lets
  // it run past the panel edge instead. minWidth: 0 lets the flex item
  // actually shrink; overflowWrap/wordBreak give it somewhere to break.
  callerItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  callerConnector: {
    color: "var(--text-muted)",
    flexShrink: 0,
    marginTop: 3,
  } satisfies CSSProperties,
  // Plain muted text, not a filled Badge pill — matches the stat row's
  // plain-text style elsewhere in this panel rather than looking like an
  // interactive/emphasized chip.
  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  // Filled pill chip overrides for Badge's default gray look, applied via
  // Badge's own `bg`/`color`/`style` props (Badge itself is
  // vendored/do-not-touch) — tinted background instead of the earlier
  // transparent+border outline. `whiteSpace: "normal"` + overflowWrap/
  // wordBreak/minWidth: 0 override Badge's hardcoded `white-space: nowrap` —
  // see client/INSIGHTS.md's unbreakable file:line entry; without this a
  // long endpoint path or cron name runs past the chip's edge instead of
  // wrapping.
  endpointBadge: {
    borderRadius: 999,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  cronBadge: {
    borderRadius: 999,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
