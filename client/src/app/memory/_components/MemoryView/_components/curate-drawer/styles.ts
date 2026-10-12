import type { CSSProperties } from "react";

/** Co-located styles for the Curate drawer (shared tokens come from the Memory page styles). */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 22, padding: "4px 2px" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  notice: {
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
  member: (primary: boolean): CSSProperties => ({
    borderLeft: `3px solid ${primary ? "var(--accent)" : "var(--border)"}`,
    paddingLeft: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  }),
  error: { color: "var(--danger)", fontSize: 13, margin: "8px 0" } satisfies CSSProperties,
  center: { padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 } satisfies CSSProperties,
};
