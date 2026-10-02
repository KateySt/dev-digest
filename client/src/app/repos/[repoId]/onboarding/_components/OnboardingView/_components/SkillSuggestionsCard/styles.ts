import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  headerIcon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  unavailable: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  settingsLink: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  info: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  tags: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 } satisfies CSSProperties,
} as const;
