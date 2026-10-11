import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 0",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  } satisfies CSSProperties,
  text: { flex: 1 } satisfies CSSProperties,
  label: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 16 } satisfies CSSProperties,
} as const;
