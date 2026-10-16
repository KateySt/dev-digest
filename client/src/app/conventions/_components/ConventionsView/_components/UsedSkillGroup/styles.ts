import type { CSSProperties } from "react";

/** Co-located styles for UsedSkillGroup. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text)", textDecoration: "underline" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
