import type React from "react";

export const wrap: React.CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  minWidth: 0,
};

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } as React.CSSProperties,
  trigger: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 99,
    padding: "3px 10px",
    fontSize: 12,
    color: "var(--text-secondary)",
    cursor: "pointer",
    textAlign: "left",
    ...wrap,
  } as React.CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } as React.CSSProperties,
  member: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: 13,
    ...wrap,
  } as React.CSSProperties,
  summary: { fontSize: 12, color: "var(--text-muted)", ...wrap } as React.CSSProperties,
  memberTitle: { fontWeight: 600, color: "var(--text-primary)", ...wrap } as React.CSSProperties,
  location: { fontSize: 12, color: "var(--text-secondary)", ...wrap } as React.CSSProperties,
  sugHeading: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  actions: { display: "flex", gap: 8 } as React.CSSProperties,
};
