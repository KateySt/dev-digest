import type { CSSProperties } from "react";

const wrap = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } as const satisfies CSSProperties;

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", ...wrap } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-secondary)", ...wrap } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", ...wrap } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
};
