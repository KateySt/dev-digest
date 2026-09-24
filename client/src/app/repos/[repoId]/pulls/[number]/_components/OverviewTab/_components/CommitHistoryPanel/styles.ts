import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  commitCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  commitHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  } satisfies CSSProperties,
  sha: {
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  message: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 2,
  } satisfies CSSProperties,
  /** Border-left color signals per-file severity — no color (transparent) for
   *  a file with no findings, matching `RiskAreasList`'s card-by-severity idiom. */
  fileRow: (color: string | null): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    borderLeft: `2px solid ${color ?? "transparent"}`,
  }),
  placeholderHint: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
