import type { CSSProperties } from "react";

/** Co-located styles for MemoryForm. */
export const s = {
  segment: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
  counter: (over: boolean): CSSProperties => ({
    fontSize: 12,
    color: over ? "var(--crit)" : "var(--text-muted)",
  }),
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  linkGroup: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  linkGroupLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginTop: 6,
  } satisfies CSSProperties,
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.55,
    outline: "none",
  } satisfies CSSProperties,
  similarBox: {
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  similarTitle: { fontSize: 13, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  similarRow: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  similarText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  source: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
};
