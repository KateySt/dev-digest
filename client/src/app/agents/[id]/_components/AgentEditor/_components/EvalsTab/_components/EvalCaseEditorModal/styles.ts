import type { CSSProperties } from "react";

type Tone = "ok" | "warn" | "crit";

/** Co-located styles for EvalCaseEditorModal. */
export const s = {
  // minmax(0, 1fr): a bare 1fr track grows to its content's max-content (client/INSIGHTS.md 2026-09-24).
  columns: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 0 } satisfies CSSProperties,
  left: { padding: 24, display: "flex", flexDirection: "column", gap: 4, minWidth: 0, borderRight: "1px solid var(--border)" } satisfies CSSProperties,
  right: { padding: 24, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  kindRow: { display: "flex", gap: 8 } satisfies CSSProperties,
  tabsWrap: { borderBottom: "1px solid var(--border)", marginBottom: 16 } satisfies CSSProperties,
  // The diff viewer deliberately keeps nowrap + horizontal scroll (code reads wrong when wrapped).
  diffPreview: {
    marginTop: 10,
    maxHeight: 220,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 7,
    fontSize: 12.5,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  diffLine: (line: string): CSSProperties => ({
    whiteSpace: "pre",
    padding: "0 10px",
    minWidth: "max-content",
    color: line.startsWith("@@") ? "var(--accent)" : "var(--text-primary)",
    background: line.startsWith("+") && !line.startsWith("+++") ? "var(--ok-bg, rgba(34,197,94,0.14))" : line.startsWith("-") && !line.startsWith("---") ? "var(--crit-bg, rgba(239,68,68,0.14))" : "transparent",
  }),
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
  warning: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 12.5,
    color: "var(--warn)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "8px 10px",
    marginBottom: 8,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  banner: (tone: Tone): CSSProperties => ({
    fontSize: 13,
    borderRadius: 8,
    padding: "10px 14px",
    border: `1px solid var(--${tone})`,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  }),
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerActions: { marginLeft: "auto", display: "flex", gap: 10 } satisfies CSSProperties,
  runOnSave: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
