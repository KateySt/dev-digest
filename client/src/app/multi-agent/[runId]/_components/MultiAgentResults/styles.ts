import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", gap: 24, padding: "24px 28px 64px", minWidth: 0 } satisfies CSSProperties,
  results: { minWidth: 0 } satisfies CSSProperties,
  loading: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
