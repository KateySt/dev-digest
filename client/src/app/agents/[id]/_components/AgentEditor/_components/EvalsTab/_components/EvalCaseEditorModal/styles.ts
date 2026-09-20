import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditorModal. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  tabsWrap: { borderBottom: "1px solid var(--border)", marginBottom: 16 } satisfies CSSProperties,
  jsonHeader: { display: "flex", alignItems: "center", marginBottom: 8, gap: 10 } satisfies CSSProperties,
  skeletonBtn: {
    fontSize: 12,
    color: "var(--accent)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    marginLeft: "auto",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  runOnSave: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  resultNote: { fontSize: 12.5, marginLeft: "auto", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
