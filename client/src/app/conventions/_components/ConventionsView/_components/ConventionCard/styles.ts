import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (status: "pending" | "accepted" | "rejected"): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 10,
    borderLeft:
      "3px solid " +
      (status === "accepted" ? "var(--ok)" : status === "rejected" ? "var(--failed)" : "var(--border)"),
    opacity: status === "rejected" ? 0.65 : 1,
  }),
  header: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  title: { flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.4 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  evidencePath: {
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  rationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: 10,
    borderRadius: 7,
    background: "var(--bg-hover)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  confidenceWrap: { flex: 1, maxWidth: 220 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
