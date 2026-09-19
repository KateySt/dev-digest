import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 14, padding: "0 24px 20px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
