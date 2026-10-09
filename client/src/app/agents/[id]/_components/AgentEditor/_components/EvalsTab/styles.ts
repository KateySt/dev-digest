import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 } satisfies CSSProperties,
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
  note: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
