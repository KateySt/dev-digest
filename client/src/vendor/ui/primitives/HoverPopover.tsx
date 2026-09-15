import React from "react";
import { createPortal } from "react-dom";

export interface HoverPopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  closeDelayMs?: number;
  align?: "start" | "end";
  width?: number;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Generic hover/focus-triggered floating panel, portaled to <body> so it
 * escapes ancestor `overflow`/stacking contexts (e.g. a table row). Unlike
 * `Dropdown` (click-toggled, positioned via a relative wrapper), this is
 * hover-driven and needs to render above content that clips overflow — hence
 * the portal + fixed-position math instead of Dropdown's simpler approach.
 *
 * Deliberately not `role="tooltip"` — the panel can contain interactive
 * content (links), which ARIA disallows inside a tooltip role.
 */
export function HoverPopover({
  trigger,
  children,
  closeDelayMs = 120,
  align = "start",
  width = 320,
  onOpenChange,
  disabled,
}: HoverPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpenRef = React.useRef(false);

  React.useEffect(() => setMounted(true), []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openNow = React.useCallback(() => {
    clearCloseTimer();
    setOpen(true);
    if (!isOpenRef.current) {
      isOpenRef.current = true;
      onOpenChange?.(true);
    }
  }, [clearCloseTimer, onOpenChange]);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      isOpenRef.current = false;
      onOpenChange?.(false);
    }, closeDelayMs);
  }, [clearCloseTimer, closeDelayMs, onOpenChange]);

  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const reposition = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + GAP;
    const rawLeft = align === "start" ? rect.left : rect.right - width;
    const left = Math.min(
      Math.max(rawLeft, VIEWPORT_MARGIN),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    setPos({ top, left });
  }, [align, width]);

  React.useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      clearCloseTimer();
      setOpen(false);
      isOpenRef.current = false;
      onOpenChange?.(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, clearCloseTimer, onOpenChange]);

  if (disabled) return <>{trigger}</>;

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={scheduleClose}
        style={{ display: "inline-flex" }}
      >
        {trigger}
      </span>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              zIndex: 40,
              animation: "ddpop .12s ease",
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
