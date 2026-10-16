import type { Theme, ThemeAccent, ThemePalette } from "@/lib/contexts";

/** Swatch fill per option. Full class names so Tailwind's scanner sees them. */
export const MODE_SWATCH: Record<Theme, string> = {
  dark: "bg-neutral-950",
  light: "bg-white",
};

export const PALETTE_SWATCH: Record<ThemePalette, string> = {
  classic: "bg-neutral-800",
  stone: "bg-stone-700",
};

export const ACCENT_SWATCH: Record<ThemeAccent, string> = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
};
