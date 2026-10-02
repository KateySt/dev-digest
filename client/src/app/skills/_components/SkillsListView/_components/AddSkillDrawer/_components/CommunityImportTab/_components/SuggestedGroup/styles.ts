import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--accent)",
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 12px",
    background: "var(--accent-bg)",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--accent)",
  } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  entries: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
  } satisfies CSSProperties,
} as const;
