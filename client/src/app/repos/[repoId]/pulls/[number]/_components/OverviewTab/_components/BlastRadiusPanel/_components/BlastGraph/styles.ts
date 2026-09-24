import type { CSSProperties } from "react";

export const s = {
  wrap: {
    height: 320,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  empty: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
