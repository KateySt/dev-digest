import type { CSSProperties } from "react";

/** Co-located styles for InstallStep. */
export const s = {
  options: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  card: (selected: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: "100%",
    minWidth: 0,
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 10,
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--accent-bg)" : "var(--bg-surface)",
    color: "var(--text-primary)",
    cursor: "pointer",
  }),
  cardTop: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  cardIcon: { flexShrink: 0, color: "var(--accent-text)" } satisfies CSSProperties,
  cardTitle: { flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  cardHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  cardBody: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere", lineHeight: 1.5 } satisfies CSSProperties,
  help: { fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
  ok: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  done: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  doneTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  doneIcon: { color: "var(--ok)" } satisfies CSSProperties,
  doneBody: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
