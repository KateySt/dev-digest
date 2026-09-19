import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  tileRow: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  agentName: { flex: 1 } satisfies CSSProperties,
  openLink: { color: "var(--text-secondary)", fontSize: 12.5, textDecoration: "none" } satisfies CSSProperties,
  emptyNote: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  acceptRateTile: {
    flex: 1,
    minWidth: 140,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    display: "flex",
    alignItems: "center",
    gap: 14,
  } satisfies CSSProperties,
  acceptRateLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } satisfies CSSProperties,
} as const;
