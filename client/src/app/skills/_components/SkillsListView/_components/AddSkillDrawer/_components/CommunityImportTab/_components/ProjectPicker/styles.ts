import type { CSSProperties } from "react";

export const s = {
  zeroRepos: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    marginBottom: 16,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  zeroReposLink: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
} as const;
