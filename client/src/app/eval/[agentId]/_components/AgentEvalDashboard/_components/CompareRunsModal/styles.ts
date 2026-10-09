import type { CSSProperties } from "react";

/** Co-located styles for CompareRunsModal (the shared cards / diff / flags live
 *  in `@/components/eval-dashboard`). Long unbroken strings (skill names/ids)
 *  WRAP: overflowWrap anywhere + minWidth 0 + minmax(0, 1fr) tracks
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
  config: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 } satisfies CSSProperties,
  configCol: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    background: "var(--bg-surface)",
    fontSize: 13,
    ...wrap,
  } satisfies CSSProperties,
  configHead: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  configList: { margin: 0, paddingLeft: 18, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
