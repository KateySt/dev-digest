import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 6 } satisfies CSSProperties,
} as const;
