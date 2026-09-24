import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
  } satisfies CSSProperties,
  stat: {
    fontSize: 13,
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  // Leading icon per stat (symbols/callers/endpoints/crons) — decorative only,
  // the text label right next to it already conveys the meaning, so callers
  // mark it `aria-hidden` at the call site.
  statIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    gap: 8,
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
