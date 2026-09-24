import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  symbolRow: (interactive: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    cursor: interactive ? "pointer" : "default",
    opacity: interactive ? 1 : 0.65,
  }),
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolFile: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  detail: {
    marginLeft: 24,
    marginTop: -2,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
} as const;
