import React from "react";

/**
 * In-page anchor nav (C-AC-7) — one `<a href="#id">` per section, native
 * anchors so keyboard reachability/operability (Tab + Enter) comes for
 * free. Resolves to a section regardless of collapse state because the
 * target `id` lives on `SectionCard`'s outer element, not its (conditionally
 * rendered) body.
 */
export function AnchorNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <nav aria-label={label} style={s.nav}>
      <ul style={s.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} style={s.link}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const s = {
  nav: { flexShrink: 0, position: "sticky", top: 16 } as React.CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 } as React.CSSProperties,
  link: {
    display: "block",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } as React.CSSProperties,
};

export default AnchorNav;
