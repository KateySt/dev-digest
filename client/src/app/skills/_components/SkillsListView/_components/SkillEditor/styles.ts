import type { CSSProperties } from "react";

/** Co-located styles for the SkillEditor shell. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700, flex: 1, minWidth: 0 } satisfies CSSProperties,
  untrustedNotice: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg, rgba(234,179,8,0.1))",
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "10px 12px",
    lineHeight: 1.5,
    marginBottom: 14,
  } satisfies CSSProperties,
  tabsBar: { margin: "0 -24px" } satisfies CSSProperties,
  body: { paddingTop: 18 } satisfies CSSProperties,
} as const;
