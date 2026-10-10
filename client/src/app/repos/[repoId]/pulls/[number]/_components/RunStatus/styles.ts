import type { CSSProperties } from "react";

/** Co-located styles for RunStatus (extracted from inline styles). */
export const s = {
  wrap: { marginBottom: 10 } satisfies CSSProperties,
  queuedList: {
    listStyle: "none",
    margin: "0 0 8px",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  queuedItem: { display: "flex", gap: 10, fontSize: 12.5 } satisfies CSSProperties,
  queuedName: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  queuedLabel: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
