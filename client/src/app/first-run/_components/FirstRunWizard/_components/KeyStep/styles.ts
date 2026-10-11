import type { CSSProperties } from "react";

export const s = {
  switch: { display: "flex", gap: 6, marginBottom: 20 } satisfies CSSProperties,
  suffix: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  revealBtn: {
    display: "grid",
    placeItems: "center",
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  connected: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ok)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  configuredHint: { fontSize: 13, color: "var(--text-secondary)", marginTop: 16 } satisfies CSSProperties,
} as const;
