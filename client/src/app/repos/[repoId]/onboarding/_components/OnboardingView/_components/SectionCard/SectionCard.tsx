"use client";

import React from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * One collapsible section card (C-AC-8): icon + heading + collapse control,
 * starts expanded, exposes its expanded state via a REAL `aria-expanded`
 * (not just a visual chevron rotation). The card's `id` sits on the outer
 * `<section>` — always rendered regardless of collapse state — so an anchor
 * link (C-AC-7) resolves to the section whether it's currently collapsed or
 * expanded; only the BODY is conditionally rendered.
 */
export function SectionCard({
  id,
  icon,
  heading,
  expandLabel,
  collapseLabel,
  children,
}: {
  id: string;
  icon: IconName;
  heading: string;
  expandLabel: string;
  collapseLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const I = Icon[icon];
  const bodyId = `${id}-body`;
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border border-border bg-elevated"
    >
      <div className="flex min-w-0 items-center gap-2.5 px-4 py-3.25">
        <I size={16} className="shrink-0 text-subtle-foreground" aria-hidden />
        <h2 id={headingId} className="m-0 text-md font-strong text-foreground">
          {heading}
        </h2>
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? collapseLabel : expandLabel}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex shrink-0 cursor-pointer border-none bg-transparent p-1 text-subtle-foreground"
        >
          <Icon.ChevronDown size={16} className={cn("transition-transform duration-150", !open && "-rotate-90")} aria-hidden />
        </button>
      </div>
      {open && (
        <div id={bodyId} className="min-w-0 px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

export default SectionCard;
