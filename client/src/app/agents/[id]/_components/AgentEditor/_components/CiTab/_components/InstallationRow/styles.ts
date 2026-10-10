import type { CSSProperties } from "react";

/** Co-located styles for InstallationRow. The repo name is an unbroken mono
 *  string, so it wraps (`overflowWrap: "anywhere"`, `minWidth: 0`). */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  repo: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 600,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  link: { fontSize: 12.5, color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
