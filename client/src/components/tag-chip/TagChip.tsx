import type React from "react";
import { cn } from "@/lib/utils";

/**
 * A coloured tag-slug chip (SPEC-07 community catalog). Renders a real
 * `<button>` only when given `onClick`; otherwise a plain `<span>` with the
 * same shape and no click affordance (client spec AC-52).
 *
 * `color` is resolved by the caller (`lib/tag-colors.ts`'s `tagColor`) from the
 * slug at runtime, so it reaches CSS as the `--tag` variable. The slug is
 * always rendered as text (AC-13) — colour is a scanning aid, never the sole
 * carrier of identity.
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
  const className = cn(
    "inline-flex max-w-full items-center rounded-full border border-(--tag) px-2.25 py-0.75 text-[11.5px] leading-[1.3] font-semibold wrap-anywhere break-words whitespace-normal",
    active ? "bg-(--tag) text-background" : "bg-transparent text-(--tag)",
  );
  const style = { "--tag": color } as React.CSSProperties;

  if (!onClick) {
    return (
      <span className={className} style={style} title={slug}>
        {slug}
      </span>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={active ?? false} className={cn(className, "cursor-pointer")} style={style}>
      {slug}
    </button>
  );
}
