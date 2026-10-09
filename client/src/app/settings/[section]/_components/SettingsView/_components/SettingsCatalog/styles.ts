import type { CSSProperties } from "react";

/** Co-located styles for SettingsCatalog. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 4 } satisfies CSSProperties,
  result: (ok: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    fontSize: 13,
    color: ok ? "var(--ok)" : "var(--crit)",
    fontWeight: 600,
  }),
} as const;
