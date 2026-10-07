import type { CSSProperties } from "react";

/** Co-located styles for ReviewAllDialog. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  text: { fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  refusal: { fontSize: 13.5, color: "var(--crit)", lineHeight: 1.5 } satisfies CSSProperties,
  failedList: { margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  // Untrusted PR titles / server error text: allow wrapping of long unbroken strings.
  failedItem: { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, padding: "14px 24px", width: "100%" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
};
