import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20, gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  configureLink: { fontSize: 13, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 12 } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, marginBottom: 10 } satisfies CSSProperties,
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({ width: 8, height: 8, borderRadius: 99, background: color }),
  section: { marginBottom: 28 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "0 10px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: {
    fontSize: 13,
    padding: "10px 10px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
