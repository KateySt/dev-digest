import type { CSSProperties } from "react";
import type { DiffLineKind } from "@/lib/eval";

/** Co-located styles for CompareRunsModal. Long unbroken strings (prompt
 *  lines, skill names/ids) WRAP: overflowWrap anywhere + minWidth 0 +
 *  minmax(0, 1fr) tracks (client/INSIGHTS.md 2026-09-24). */
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties;

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 } satisfies CSSProperties,
  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: "14px 16px",
    minWidth: 0,
  } satisfies CSSProperties,
  cardLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  cardRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  oldValue: { fontSize: 16, color: "var(--text-muted)" } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  flags: { display: "flex", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  flag: {
    fontSize: 12.5,
    color: "var(--warn)",
    border: "1px solid var(--warn)",
    borderRadius: 6,
    padding: "3px 10px",
    ...wrap,
  } satisfies CSSProperties,
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
  legend: { display: "flex", gap: 16, marginBottom: 10, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 12, height: 12, borderRadius: 3, background: color }),
  diffBlock: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: "10px 0",
    fontSize: 13,
    lineHeight: 1.6,
    minWidth: 0,
  } satisfies CSSProperties,
  diffLine: (kind: DiffLineKind): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    ...wrap,
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
    background:
      kind === "add" ? "var(--ok-bg, rgba(16,185,129,0.12))" : kind === "del" ? "var(--crit-bg, rgba(239,68,68,0.12))" : "transparent",
    textDecoration: kind === "del" ? "line-through" : "none",
  }),
  diffSkip: { padding: "2px 14px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  diffMark: { flexShrink: 0, width: 10, color: "var(--text-muted)", textDecoration: "none" } satisfies CSSProperties,
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
  confirm: {
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13,
    color: "var(--text-secondary)",
    ...wrap,
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", ...wrap } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
