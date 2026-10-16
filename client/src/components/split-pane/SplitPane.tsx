/* SplitPane — list | detail layout with a draggable divider. The right pane
   keeps a pixel width (remembered per `storageKey` in localStorage), the left
   one takes the rest; both respect a minimum width. The divider is a focusable
   ARIA separator: drag it, use ←/→ (Shift = bigger steps), Home/End, or
   double-click to reset. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { clampRightWidth, readStoredWidth, storeWidth } from "./helpers";

const STEP = 16;
const BIG_STEP = 64;

export function SplitPane({
  left,
  right,
  storageKey,
  defaultRightWidth,
  minLeftWidth,
  minRightWidth,
  className,
  rightClassName,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  /** localStorage key for the remembered width (one per page). */
  storageKey: string;
  defaultRightWidth: number;
  minLeftWidth: number;
  minRightWidth: number;
  className?: string;
  rightClassName?: string;
}) {
  const t = useTranslations("common.splitPane");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(defaultRightWidth);
  const [dragging, setDragging] = React.useState(false);

  const clamp = React.useCallback(
    (w: number) => {
      const container = containerRef.current?.clientWidth ?? w + minLeftWidth;
      return clampRightWidth(w, container, minLeftWidth, minRightWidth);
    },
    [minLeftWidth, minRightWidth],
  );

  const commit = React.useCallback(
    (w: number) => {
      const next = clamp(w);
      setWidth(next);
      storeWidth(storageKey, next);
    },
    [clamp, storageKey],
  );

  // Restore the remembered width after mount (no localStorage on the server).
  React.useEffect(() => {
    setWidth(clamp(readStoredWidth(storageKey) ?? defaultRightWidth));
  }, [clamp, storageKey, defaultRightWidth]);

  // A smaller window must not push either pane under its minimum.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth((w) => clamp(w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const { right: edge } = containerRef.current.getBoundingClientRect();
    setWidth(clamp(edge - e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    storeWidth(storageKey, width);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    // The divider sits left of the right pane: ← widens it, → narrows it.
    if (e.key === "ArrowLeft") commit(width + step);
    else if (e.key === "ArrowRight") commit(width - step);
    else if (e.key === "Home") commit(Number.MAX_SAFE_INTEGER);
    else if (e.key === "End") commit(minRightWidth);
    else return;
    e.preventDefault();
  };

  const max = containerRef.current ? Math.max(minRightWidth, containerRef.current.clientWidth - minLeftWidth) : undefined;

  return (
    <div
      ref={containerRef}
      className={cn("flex min-h-0", dragging && "cursor-col-resize select-none", className)}
      style={{ "--right-w": `${width}px` } as React.CSSProperties}
    >
      <div className="relative min-w-0 flex-1">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resize")}
        aria-valuenow={width}
        aria-valuemin={minRightWidth}
        aria-valuemax={max}
        tabIndex={0}
        title={t("hint")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => commit(defaultRightWidth)}
        className={cn(
          "group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-colors",
          "hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary",
          dragging && "after:w-0.5 after:bg-primary",
        )}
      />
      <div className={cn("relative w-(--right-w) shrink-0", rightClassName)}>{right}</div>
    </div>
  );
}
