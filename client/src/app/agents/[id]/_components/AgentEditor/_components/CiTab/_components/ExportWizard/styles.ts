import type { CSSProperties } from "react";

/** Co-located styles for ExportWizard (the modal shell). */
export const s = {
  stepper: { padding: "16px 24px 14px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
