import React from "react";

/**
 * A colored tag-slug chip (SPEC-07 community catalog). Additive primitive —
 * `Chip` can't be reused here: it applies `color` to its icon only (never
 * background/border/text) and always renders a `<button>`, which breaks the
 * inert, non-interactive use on `SkillCard` (client spec AC-52). `TagChip`
 * renders a real `<button>` only when given `onClick`; otherwise it's a
 * plain `<span>` — same shape, no click affordance.
 *
 * `color` is resolved by the caller (`lib/tag-colors.ts`'s `tagColor`) so
 * this primitive stays a pure renderer with no theme/hash knowledge of its
 * own. The slug is always rendered as text (AC-13) — color is a scanning
 * aid, never the sole carrier of identity.
 */
export function TagChip({
  slug,
  color,
  active,
  onClick,
}: {
  slug: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    lineHeight: 1.3,
    border: `1px solid ${color}`,
    background: active ? color : "transparent",
    color: active ? "var(--bg-primary)" : color,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    whiteSpace: "normal",
  };

  if (!onClick) {
    return (
      <span style={style} title={slug}>
        {slug}
      </span>
    );
  }

  return (
    <button type="button" onClick={onClick} style={{ ...style, cursor: "pointer" }}>
      {slug}
    </button>
  );
}
