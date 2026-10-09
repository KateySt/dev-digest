import type { CSSProperties } from "react";

/** Co-located styles for OnboardingView. The anchor-nav/sections layout uses
 *  `minmax(0, 1fr)` tracks (not a bare `1fr`) so a long unbroken path in the
 *  sections column can't expand the grid track past the page edge before a
 *  section body's own wrap rules apply (client/INSIGHTS.md 2026-09-24 — this
 *  page is path-dense, three of five sections are path lists). */
export const s = {
  page: {
    padding: "24px 32px 60px",
    maxWidth: 1080,
    margin: "0 auto",
    boxSizing: "border-box",
  } satisfies CSSProperties,

  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  pageTitle: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,

  generateError: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
  } satisfies CSSProperties,

  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  } satisfies CSSProperties,

  centerFill: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "50vh",
  } satisfies CSSProperties,
} as const;
