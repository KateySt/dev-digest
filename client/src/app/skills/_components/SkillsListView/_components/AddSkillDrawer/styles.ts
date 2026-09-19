import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer. */
export const s = {
  tabsWrap: { borderBottom: "1px solid var(--border)", marginBottom: 20 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  noMatch: {
    padding: "20px 0",
    textAlign: "center",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  noMatchTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  communityList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  communityRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  communityInfo: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  communityName: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  communityDesc: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
