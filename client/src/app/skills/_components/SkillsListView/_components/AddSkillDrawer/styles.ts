import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer and its tabs. Tab-specific styles
 *  (Community tab's accordion/rows/chips) live with the owning sub-component
 *  instead of growing this file. */
export const s = {
  tabsWrap: { borderBottom: "1px solid var(--border)", marginBottom: 20 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
} as const;
