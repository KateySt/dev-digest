import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { type DropdownItemDef } from "./types";

function DropdownItem({ it, onClose }: { it: DropdownItemDef; onClose: () => void }) {
  const [h, setH] = React.useState(false);
  const I = it.icon ? Icon[it.icon] : null;
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => {
        it.onClick?.();
        onClose();
      }}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 6,
        border: "none",
        background: h ? "var(--bg-hover)" : "transparent",
        color: it.muted ? "var(--text-secondary)" : "var(--text-primary)",
        fontSize: 14,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {I && <I size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
      {it.hint && (
        <span
          style={{
            flexBasis: "100%",
            marginLeft: 24,
            fontSize: 12,
            color: "var(--text-muted)",
            wordBreak: "break-word",
          }}
        >
          {it.hint}
        </span>
      )}
      {it.onRemove && (
        <span
          role="button"
          aria-label={it.removeLabel ?? "Remove"}
          title={it.removeLabel ?? "Remove"}
          onClick={(e) => {
            e.stopPropagation();
            it.onRemove!();
            onClose();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            borderRadius: 5,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </button>
  );
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Portaled to <body> (like HoverPopover) so the menu escapes any ancestor's
 * `overflow`/stacking context — e.g. a table row can't clip or bury it under
 * later rows. Position is computed from the trigger's viewport rect and
 * flips above the trigger, or caps its own height with an internal scroll,
 * whichever keeps it fully on-screen without the page needing to scroll.
 */
export function Dropdown({
  trigger,
  items,
  align = "left",
  width = 230,
}: {
  trigger: React.ReactNode;
  items: DropdownItemDef[];
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight?: number } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  const reposition = React.useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openUp = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    // Only cap height (and scroll internally) in the rare case the menu is
    // taller than the larger of the two available gaps — normally it just fits.
    const maxHeight = panelHeight > available ? Math.max(available, 80) : undefined;
    const top = openUp ? rect.top - GAP - (maxHeight ?? panelHeight) : rect.bottom + GAP;
    const rawLeft = align === "left" ? rect.left : rect.right - width;
    const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
    setPos({ top: Math.max(top, VIEWPORT_MARGIN), left, maxHeight });
  }, [align, width]);

  // Measure-then-position: first layout pass renders the panel off-screen
  // (but still measurable) so its real height is known before it's shown,
  // avoiding a visible jump when it flips.
  React.useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, items, reposition]);

  React.useEffect(() => {
    if (!open) return;
    // capture:true is needed to catch scrolling of any ancestor of the
    // trigger — but it also catches the panel's own internal list scroll
    // (e.g. hovering + wheel-scrolling through items). Skip those: the
    // panel scrolling internally never changes the trigger's position, and
    // re-measuring mid-scroll reads the already-clamped height, which was
    // collapsing maxHeight and stranding items below the viewport.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      reposition();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            className={pos?.maxHeight ? "dd-dropdown-panel" : undefined}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
              width,
              maxHeight: pos?.maxHeight,
              overflowY: pos?.maxHeight ? "scroll" : undefined,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              zIndex: 40,
              animation: "ddpop .12s ease",
            }}
          >
            {items.map((it, i) =>
              it.divider ? (
                <div key={i} style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
              ) : (
                <DropdownItem key={i} it={it} onClose={() => setOpen(false)} />
              )
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
