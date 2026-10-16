/** Fallback hues, picked deterministically from the name's first char. Full
 *  class strings so Tailwind's scanner sees them. */
const HUES = [
  "bg-blue-500/13 text-blue-500 border-blue-500/27",
  "bg-emerald-500/13 text-emerald-500 border-emerald-500/27",
  "bg-amber-500/13 text-amber-500 border-amber-500/27",
  "bg-violet-500/13 text-violet-500 border-violet-500/27",
  "bg-pink-500/13 text-pink-500 border-pink-500/27",
  "bg-teal-500/13 text-teal-500 border-teal-500/27",
];

export function avatarHue(name: string): string {
  return HUES[name.charCodeAt(0) % HUES.length] ?? HUES[0]!;
}

export function initials(name: string): string {
  return name
    .split(/[\s-]/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
