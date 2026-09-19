import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20, gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  filterBar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  filterItem: { width: 160 } satisfies CSSProperties,
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
  viewLink: { color: "var(--accent)", fontSize: 12.5 } satisfies CSSProperties,
} as const;
