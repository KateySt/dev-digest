

/**
 * In-page anchor nav (C-AC-7) — one `<a href="#id">` per section, native
 * anchors so keyboard reachability/operability (Tab + Enter) comes for
 * free. Resolves to a section regardless of collapse state because the
 * target `id` lives on `SectionCard`'s outer element, not its (conditionally
 * rendered) body.
 */
export function AnchorNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <nav aria-label={label} className="sticky top-4 shrink-0">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default AnchorNav;
