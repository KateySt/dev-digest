import type { CSSProperties } from "react";

const wrap: CSSProperties = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 };

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  panel: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, minWidth: 0 } satisfies CSSProperties,
  summary: (accent: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: 16,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${accent}`,
    borderRadius: 10,
    minWidth: 0,
  }),
  summaryMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  summaryName: (accent: string): CSSProperties => ({
    fontSize: 15,
    fontWeight: 600,
    color: accent,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  }),
  summaryText: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, ...wrap } satisfies CSSProperties,
  summaryAside: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 } satisfies CSSProperties,
  traceBtn: { background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-secondary)", fontSize: 12.5 } satisfies CSSProperties,
  meta: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  findingWrap: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
