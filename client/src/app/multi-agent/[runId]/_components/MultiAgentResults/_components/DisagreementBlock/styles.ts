import type React from "react";

/** Long file paths / titles must wrap, never push the grid past the page edge. */
export const wrap: React.CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  minWidth: 0,
};

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  toggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } as React.CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } as React.CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } as React.CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
    overflow: "hidden",
  } as React.CSSProperties,
  rowLabel: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    ...wrap,
  } as React.CSSProperties,
  location: { fontSize: 12.5, color: "var(--text-secondary)", ...wrap } as React.CSSProperties,
  cells: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
    minWidth: 0,
  } as React.CSSProperties,
  cell: {
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderRight: "1px solid var(--border)",
    fontSize: 12.5,
    ...wrap,
  } as React.CSSProperties,
  agent: { fontWeight: 600, color: "var(--text-primary)", ...wrap } as React.CSSProperties,
  verdict: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  } as React.CSSProperties,
};
