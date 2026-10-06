import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView. The two-column layout uses
 *  `minmax(0, 1fr)` tracks (not a bare `1fr`) so a long unbroken path can't
 *  expand the left column past the page edge before the row's own wrap
 *  rules apply (client/INSIGHTS.md 2026-09-24). */
export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    padding: "24px 32px",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  content: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  panelFill: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" } satisfies CSSProperties,
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
    flexShrink: 0,
  } satisfies CSSProperties,
  pageTitle: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,

  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)",
    gap: 20,
    alignItems: "stretch",
    flex: 1,
    minHeight: 0,
  } satisfies CSSProperties,

  refusal: {
    marginBottom: 16,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  refusalTitle: { fontSize: 13, fontWeight: 700, color: "var(--crit)", marginBottom: 6 } satisfies CSSProperties,
  refusalBody: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  refusalPath: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,

  panel: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,

  listHeader: {
    padding: "14px 12px 10px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  listHeaderLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  listHeaderPath: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    background: active ? "var(--accent-bg)" : "transparent",
    cursor: "pointer",
    minWidth: 0,
  }),
  rowPathBox: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowPath: {
    fontSize: 13,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,

  footer: {
    padding: "10px 12px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    minWidth: 0,
    flexShrink: 0,
  } satisfies CSSProperties,
  detailPathBox: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  detailPath: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "var(--font-mono, monospace)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
  detailActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  detailMeta: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
    flexWrap: "wrap",
    flexShrink: 0,
  } satisfies CSSProperties,
  coverageRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 140,
  } satisfies CSSProperties,
  coveragePct: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  coverageBar: {
    flex: 1,
    minWidth: 60,
  } satisfies CSSProperties,
  detailBody: { padding: 16, minWidth: 0, flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  editActions: { display: "flex", gap: 10, marginTop: 12 } satisfies CSSProperties,
  saveError: { fontSize: 13, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
