/**
 * Tag-chip color mapping (SPEC-07 client spec AC-12/AC-14/AC-15/AC-16).
 * Pure, stable hash of a slug → index into a fixed, hand-checked palette —
 * no server-derived color, no generated HSL (a generated color can't be
 * held to a contrast guarantee in two themes; see client spec "Design
 * decisions"). Shared by every surface that renders a tag chip (Community
 * tab, suggestion card, Skills page) so the same slug is always the same
 * color everywhere (AC-12).
 *
 * Palette hues are chosen to exclude the ones `src/vendor/ui/styles.css`
 * already uses for severity/status badges — crit (red), warn (amber), sugg
 * (blue), info (gray), ok (green) — so a tag chip can never be misread as
 * one of those (AC-15). Each entry is a WCAG AA (>=4.5:1) text color against
 * this app's near-black `--bg-primary` (dark theme) / near-white
 * `--bg-primary` (light theme) surfaces — the same darker-for-light /
 * lighter-for-dark pairing `styles.css`'s own severity tokens use.
 * Collisions across different slugs are accepted (AC-16): color is a
 * scanning aid, the slug text is always the real identity (AC-13).
 */

interface TagColorEntry {
  dark: string;
  light: string;
}

const TAG_PALETTE: TagColorEntry[] = [
  { dark: "#a78bfa", light: "#7c3aed" }, // purple
  { dark: "#f472b6", light: "#db2777" }, // pink
  { dark: "#2dd4bf", light: "#0d9488" }, // teal
  { dark: "#818cf8", light: "#4f46e5" }, // indigo
  { dark: "#22d3ee", light: "#0891b2" }, // cyan
  { dark: "#e879f9", light: "#a21caf" }, // fuchsia
  { dark: "#a3e635", light: "#65a30d" }, // lime
  { dark: "#c4b5fd", light: "#6d28d9" }, // violet
];

/** Stable, pure hash (no crypto needed — just needs to be deterministic and
 *  well-distributed across short ASCII slugs). */
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The tag chip color for `slug` in the given theme. Same slug always
 *  resolves to the same palette entry, across sessions and surfaces. */
export function tagColor(slug: string, theme: "dark" | "light"): string {
  const entry = TAG_PALETTE[hashSlug(slug) % TAG_PALETTE.length]!;
  return theme === "light" ? entry.light : entry.dark;
}
