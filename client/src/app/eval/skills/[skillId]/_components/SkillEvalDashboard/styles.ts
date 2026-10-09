import type { CSSProperties } from "react";

/** Co-located styles for SkillEvalDashboard (cards / banner / trend / table live
 *  in `@/components/eval-dashboard`). Long unbroken strings wrap
 *  (client/INSIGHTS.md 2026-09-24). */
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties;

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 260 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", ...wrap } satisfies CSSProperties,
  chip: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "2px 9px",
    ...wrap,
  } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    border: "1px solid var(--crit)",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 18,
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
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  runsHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  selectedNote: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  compareBtn: { marginLeft: "auto" } satisfies CSSProperties,
  tableWrap: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
  } satisfies CSSProperties,
  muted: { fontSize: 13.5, color: "var(--text-muted)", padding: "18px 12px" } satisfies CSSProperties,
} as const;
