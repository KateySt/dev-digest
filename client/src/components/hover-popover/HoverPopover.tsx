"use client";

import React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * Hover/focus-triggered floating panel on shadcn HoverCard (portaled, so it
 * escapes a table row's `overflow`). Opens immediately on mouse enter or
 * focus and closes `closeDelayMs` after the pointer leaves both the trigger
 * and the panel, so the panel's links stay reachable. Set the panel width
 * with `className` (e.g. `w-85`).
 *
 * Deliberately not `role="tooltip"` — the panel can contain interactive
 * content (links), which ARIA disallows inside a tooltip role.
 */
export function HoverPopover({
  trigger,
  children,
  closeDelayMs = 120,
  align = "start",
  className,
  onOpenChange,
  disabled,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  closeDelayMs?: number;
  align?: "start" | "end";
  className?: string;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isOpenRef = React.useRef(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const change = React.useCallback(
    (next: boolean) => {
      clearCloseTimer();
      setOpen(next);
      if (isOpenRef.current !== next) {
        isOpenRef.current = next;
        onOpenChange?.(next);
      }
    },
    [clearCloseTimer, onOpenChange],
  );

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => change(false), closeDelayMs);
  }, [change, clearCloseTimer, closeDelayMs]);

  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);

  if (disabled) return <>{trigger}</>;

  return (
    <HoverCard open={open} onOpenChange={change} openDelay={0} closeDelay={closeDelayMs}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          aria-haspopup="true"
          aria-expanded={open}
          className="inline-flex"
          onMouseEnter={() => change(true)}
          onMouseLeave={scheduleClose}
          onFocus={() => change(true)}
          onBlur={scheduleClose}
        >
          {trigger}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align={align}
        sideOffset={6}
        collisionPadding={8}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "z-40 w-80 rounded-[9px] border-border-strong bg-elevated p-0 text-foreground shadow-modal",
          className,
        )}
      >
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}
