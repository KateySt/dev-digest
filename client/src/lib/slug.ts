/** Kebab-cases a name for use as a display filename (e.g. the CodeField tab
 *  label) — not a persisted identifier. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
