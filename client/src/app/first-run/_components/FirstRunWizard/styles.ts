import type { CSSProperties } from "react";

/** Co-located styles for the first-run wizard (mirrors AddRepoView's full-screen card). */
export const s = {
  page: {
    width: "100%",
    minHeight: "100vh",
    background: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "44px 28px",
  } satisfies CSSProperties,
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 32 } satisfies CSSProperties,
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "var(--text-primary)",
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  brandName: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  card: {
    width: 520,
    maxWidth: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 32,
    boxShadow: "var(--shadow-modal)",
  } satisfies CSSProperties,
  footer: { fontSize: 13, color: "var(--text-muted)", marginTop: 24 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;

/** Shared by the step bodies (KeyStep / RepoStep). */
export const stepStyles = {
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  body: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 12, alignItems: "center", marginTop: 24 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  note: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: -12,
  } satisfies CSSProperties,
  result: (ok: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    marginTop: 16,
    fontSize: 13,
    color: "var(--text-secondary)",
    background: ok ? "var(--ok-bg)" : "var(--crit-bg)",
    border: `1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
  }),
} as const;
