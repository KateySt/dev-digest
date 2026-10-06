"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";

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
    <section id={id} style={s.card} aria-labelledby={headingId}>
      <div style={s.header}>
        <I size={16} style={s.icon} />
        <h2 id={headingId} style={s.heading}>
          {heading}
        </h2>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? collapseLabel : expandLabel}
          onClick={() => setOpen((o) => !o)}
          style={s.collapseBtn}
        >
          <Icon.ChevronDown
            size={16}
            style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }}
          />
        </button>
      </div>
      {open && (
        <div id={bodyId} style={s.body}>
          {children}
        </div>
      )}
    </section>
  );
}

const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    scrollMarginTop: 16,
    minWidth: 0,
  } as React.CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", minWidth: 0 } as React.CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } as React.CSSProperties,
  heading: { fontSize: 15, fontWeight: 650, margin: 0, color: "var(--text-primary)" } as React.CSSProperties,
  collapseBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "inline-flex",
    color: "var(--text-muted)",
    flexShrink: 0,
  } as React.CSSProperties,
  body: { padding: "0 16px 16px", minWidth: 0 } as React.CSSProperties,
};

export default SectionCard;
