import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: { padding: "24px 28px 44px", maxWidth: 920, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 6 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "18px 0 14px",
  } satisfies CSSProperties,
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  candidateCount: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  deselectAll: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
