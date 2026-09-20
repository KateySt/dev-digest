import type { CSSProperties } from "react";

/** Co-located styles for AgentPerformanceView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 20 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  tileRow: { display: "flex", gap: 14, marginBottom: 28 } satisfies CSSProperties,
  donutRow: { display: "flex", gap: 32, marginBottom: 28 } satisfies CSSProperties,
  donutCol: { flex: 1 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 12 } satisfies CSSProperties,
  tableHeader: { display: "flex", alignItems: "center", marginBottom: 12 } satisfies CSSProperties,
  sortWrap: { marginLeft: "auto", width: 160 } satisfies CSSProperties,
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
  agentName: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
