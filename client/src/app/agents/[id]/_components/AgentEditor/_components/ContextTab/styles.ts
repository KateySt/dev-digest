import type { CSSProperties } from "react";

/** Co-located styles for the Agent editor's Context tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    margin: "16px 0",
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "24px 0",
    textAlign: "center",
  } satisfies CSSProperties,
  footerRow: {
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  footerTokens: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  footerNote: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
