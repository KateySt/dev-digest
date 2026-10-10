import type { CSSProperties } from "react";

/** Co-located styles for ConfigureStep. */
export const s = {
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  chips: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  radios: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  radio: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 10px 6px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: {
    fontSize: 13,
    padding: "9px 10px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  info: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  infoIcon: { flexShrink: 0, marginTop: 2, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
