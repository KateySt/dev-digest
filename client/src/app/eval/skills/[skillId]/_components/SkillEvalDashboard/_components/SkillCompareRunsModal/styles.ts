import type { CSSProperties } from "react";

/** Co-located styles for SkillCompareRunsModal (cards / diff / flags live in
 *  `@/components/eval-dashboard`). Provider/model strings wrap
 *  (client/INSIGHTS.md 2026-09-24). */
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties;

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  modelRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    background: "var(--bg-surface)",
    fontSize: 13,
    ...wrap,
  } satisfies CSSProperties,
  modelValue: { ...wrap } satisfies CSSProperties,
  modelNote: {
    fontSize: 12.5,
    color: "var(--warn)",
    border: "1px solid var(--warn)",
    borderRadius: 6,
    padding: "2px 9px",
  } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
