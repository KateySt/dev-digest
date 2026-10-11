import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 680, margin: "0 auto", padding: "32px 24px 64px", display: "flex", flexDirection: "column", gap: 28 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "6px 0 0", lineHeight: 1.5 } satisfies CSSProperties,
  stepHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  stepTitle: (dim: boolean): CSSProperties => ({ fontSize: 14, fontWeight: 600, color: dim ? "var(--text-muted)" : "var(--text-primary)", flex: 1 }),
  badge: (dim: boolean): CSSProperties => ({
    width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600,
    background: dim ? "var(--bg-hover)" : "var(--accent-bg)", color: dim ? "var(--text-muted)" : "var(--accent-text)",
  }),
  selectAll: { background: "none", border: "none", color: "var(--accent-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" } satisfies CSSProperties,
  prSelect: { maxWidth: 420 } satisfies CSSProperties,
  placeholder: { border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-elevated)" } satisfies CSSProperties,
  list: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 } satisfies CSSProperties,
  card: (checked: boolean, color: string): CSSProperties => ({
    display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, textAlign: "left", width: "100%", minWidth: 0,
    cursor: "pointer", color: "inherit",
    border: `1px solid ${checked ? color : "var(--border)"}`,
    background: checked ? `color-mix(in srgb, ${color} 10%, transparent)` : "var(--bg-elevated)",
  }),
  box: (checked: boolean, color: string): CSSProperties => ({
    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2, display: "grid", placeItems: "center",
    border: `1.5px solid ${checked ? color : "var(--border-strong)"}`, background: checked ? color : "transparent", color: "#fff",
  }),
  iconBox: (color: string): CSSProperties => ({
    width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center", color,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
  }),
  body: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  desc: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.45, overflowWrap: "anywhere" } satisfies CSSProperties,
  estimate: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 20 } satisfies CSSProperties,
  total: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  incomplete: { color: "var(--warning, #f59e0b)", marginLeft: 8 } satisfies CSSProperties,
  error: { marginTop: 12, fontSize: 13, color: "var(--danger, #ef4444)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", overflowWrap: "anywhere" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
