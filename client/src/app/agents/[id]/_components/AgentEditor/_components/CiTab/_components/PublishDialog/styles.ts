import type { CSSProperties } from "react";

/** Co-located styles for PublishDialog. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  intro: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  filesLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  fileBlock: { marginBottom: 10 } satisfies CSSProperties,
  filePath: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  fileContent: {
    fontSize: 12,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 10,
    maxHeight: 160,
    overflow: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  secretNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  doneWrap: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  doneTitle: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  doneBody: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  prLink: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
} as const;
