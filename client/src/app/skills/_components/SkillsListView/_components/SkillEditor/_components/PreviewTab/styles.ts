import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 4, maxWidth: 900 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  card: {
    padding: "16px 18px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
