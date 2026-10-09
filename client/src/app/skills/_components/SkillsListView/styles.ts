import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

/** Co-located styles for SkillsListView. */
export const s = {
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  left: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    padding: "24px 28px 44px",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  scopeSwitcher: { width: 190, flexShrink: 0 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  right: {
    width: 560,
    flexShrink: 0,
    borderLeft: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "auto",
    padding: 24,
  } satisfies CSSProperties,
  selectPrompt: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: 6,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  selectPromptTitle: { fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  selectPromptBody: { fontSize: 13, maxWidth: 220 } satisfies CSSProperties,
} as const;
