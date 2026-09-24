import type { CSSProperties } from "react";

export const s = {
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  headRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    // Without this, a long nowrap Badge (low-confidence) refuses to shrink
    // below its own content width, so ALL the squeeze lands on intentText
    // instead — it collapses to a ~1-word-wide column. Wrapping lets the
    // badge drop to its own line instead of crushing the paragraph.
    flexWrap: "wrap",
  } satisfies CSSProperties,
  // Badge (vendor/ui) hardcodes `white-space: nowrap` for short pill labels —
  // fine for "CRITICAL", not for a full low-confidence sentence. Override via
  // Badge's own `style` prop rather than editing the vendored component:
  // `flex: 1 1 100%` makes it claim the full wrapped row (headRow already
  // wraps the badge onto its own line below intentText) so long text has
  // real width to wrap into instead of hugging its own content width.
  lowConfidenceBadge: {
    whiteSpace: "normal",
    flex: "1 1 100%",
    textAlign: "left",
  } satisfies CSSProperties,
  intentText: {
    margin: 0,
    flex: "1 1 260px",
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  listLabel: (inScope: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: inScope ? "var(--ok)" : "var(--crit)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 4,
  }),
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  specNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  } satisfies CSSProperties,
} as const;
