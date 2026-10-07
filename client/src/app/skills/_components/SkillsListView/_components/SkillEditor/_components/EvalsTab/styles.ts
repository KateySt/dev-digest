import type { CSSProperties } from "react";

/** Co-located styles for the skill EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 900, minWidth: 0 } satisfies CSSProperties,
  metricsHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  metricsLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  dashLink: {
    marginLeft: "auto",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  trend: {
    display: "block",
    marginTop: 14,
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    color: "inherit",
    textDecoration: "none",
    minWidth: 0,
    overflow: "hidden",
  } satisfies CSSProperties,
  trendTitle: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  trendEmpty: { marginTop: 14, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    border: "1px solid var(--crit)",
    borderRadius: 8,
    padding: "8px 12px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
