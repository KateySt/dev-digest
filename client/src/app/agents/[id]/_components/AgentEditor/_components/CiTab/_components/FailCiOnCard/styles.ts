import type { CSSProperties } from "react";

/** Co-located styles for FailCiOnCard. */
export const s = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  helper: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  segments: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    flexShrink: 0,
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    cursor: "pointer",
  }),
} as const;
