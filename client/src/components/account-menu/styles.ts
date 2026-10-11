import type { CSSProperties } from "react";

export const s = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 8px 3px 3px",
    borderRadius: 99,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  login: { fontSize: 13, fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  anon: {
    width: 26,
    height: 26,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
