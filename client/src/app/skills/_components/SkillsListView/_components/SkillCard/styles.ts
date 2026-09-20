import type { CSSProperties } from "react";

/** Co-located styles for SkillCard. */
export const s = {
  card: (active: boolean, flagged?: boolean): CSSProperties => ({
    padding: 16,
    borderRadius: 10,
    border: "1px solid " + (flagged ? "var(--crit)" : active ? "var(--accent)" : "var(--border)"),
    background: "var(--bg-surface)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: { flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  usageRow: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
