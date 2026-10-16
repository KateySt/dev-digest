/* theme.tsx — appearance via attributes on <html>, read by globals.css:
   data-theme (mode: dark | light), data-palette (surface family) and
   data-accent (brand colour). Each is persisted separately in localStorage.
   The stored mode may be "system": it follows prefers-color-scheme, while
   data-theme always holds the resolved dark | light. */
"use client";

import React from "react";
import { useDesktop } from "@/lib/desktop";

export const THEME_MODES = ["dark", "light"] as const;
/** What the user picks in Settings — a mode, or follow the OS. */
export const THEME_PREFS = [...THEME_MODES, "system"] as const;
export const THEME_PALETTES = ["classic", "stone"] as const;
export const THEME_ACCENTS = ["blue", "indigo", "violet", "emerald"] as const;

export type Theme = (typeof THEME_MODES)[number];
export type ThemePref = (typeof THEME_PREFS)[number];
export type ThemePalette = (typeof THEME_PALETTES)[number];
export type ThemeAccent = (typeof THEME_ACCENTS)[number];

interface Appearance {
  /** Resolved mode — what the page is actually rendered in. */
  theme: Theme;
  /** Stored choice; "system" resolves through prefers-color-scheme. */
  themePref: ThemePref;
  palette: ThemePalette;
  accent: ThemeAccent;
}

const DEFAULTS: Appearance = { theme: "dark", themePref: "dark", palette: "classic", accent: "blue" };

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** <html> attribute + localStorage key per appearance axis. */
const AXES = {
  theme: { attr: "data-theme", storageKey: "dd-theme", values: THEME_PREFS },
  palette: { attr: "data-palette", storageKey: "dd-palette", values: THEME_PALETTES },
  accent: { attr: "data-accent", storageKey: "dd-accent", values: THEME_ACCENTS },
} as const;

interface ThemeContextValue extends Appearance {
  toggle: () => void;
  set: (t: ThemePref) => void;
  setPalette: (p: ThemePalette) => void;
  setAccent: (a: ThemeAccent) => void;
}

const ThemeCtx = React.createContext<ThemeContextValue>({
  ...DEFAULTS,
  toggle: () => {},
  set: () => {},
  setPalette: () => {},
  setAccent: () => {},
});

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && !window.matchMedia(DARK_QUERY).matches ? "light" : "dark";
}

const resolve = (pref: ThemePref): Theme => (pref === "system" ? systemTheme() : pref);

function isOneOf<T extends string>(v: string | null, values: readonly T[]): v is T {
  return (values as readonly string[]).includes(v ?? "");
}

function readAttr<A extends "palette" | "accent">(axis: A): Appearance[A] {
  const { attr, values } = AXES[axis];
  const v = document.documentElement.getAttribute(attr);
  return (isOneOf(v, values) ? v : DEFAULTS[axis]) as Appearance[A];
}

/** The stored mode choice; falls back to the attribute the no-FOUC script set. */
function readThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(AXES.theme.storageKey);
    if (isOneOf(stored, THEME_PREFS)) return stored;
  } catch {
    /* ignore */
  }
  const attr = document.documentElement.getAttribute(AXES.theme.attr);
  return isOneOf(attr, THEME_MODES) ? attr : DEFAULTS.themePref;
}

/** data-theme always holds the resolved mode, never "system". */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute(AXES.theme.attr, theme);
}

function persist(storageKey: string, value: string) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearance] = React.useState<Appearance>(DEFAULTS);
  const desktop = useDesktop();

  // hydrate from the attributes set by the no-FOUC inline script
  React.useEffect(() => {
    const themePref = readThemePref();
    const theme = resolve(themePref);
    applyTheme(theme);
    setAppearance({ theme, themePref, palette: readAttr("palette"), accent: readAttr("accent") });
  }, []);

  const { themePref, theme } = appearance;

  // "system": follow OS light/dark switches live.
  React.useEffect(() => {
    if (themePref !== "system" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = systemTheme();
      applyTheme(next);
      setAppearance((prev) => ({ ...prev, theme: next }));
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [themePref]);

  // Desktop app: native menus, dialogs and the window background follow the studio.
  React.useEffect(() => {
    void desktop?.app.setThemeSource(themePref);
  }, [desktop, themePref]);

  const set = React.useCallback((t: ThemePref) => {
    const next = resolve(t);
    applyTheme(next);
    persist(AXES.theme.storageKey, t);
    setAppearance((prev) => ({ ...prev, themePref: t, theme: next }));
  }, []);
  const setPalette = React.useCallback((p: ThemePalette) => {
    document.documentElement.setAttribute(AXES.palette.attr, p);
    persist(AXES.palette.storageKey, p);
    setAppearance((prev) => ({ ...prev, palette: p }));
  }, []);
  const setAccent = React.useCallback((a: ThemeAccent) => {
    document.documentElement.setAttribute(AXES.accent.attr, a);
    persist(AXES.accent.storageKey, a);
    setAppearance((prev) => ({ ...prev, accent: a }));
  }, []);
  const toggle = React.useCallback(() => {
    set(theme === "dark" ? "light" : "dark");
  }, [theme, set]);

  const value = React.useMemo(
    () => ({ ...appearance, toggle, set, setPalette, setAccent }),
    [appearance, toggle, set, setPalette, setAccent],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeCtx);
}

/** Inline script string injected in <head> to set the appearance attributes before paint. */
export const themeNoFlashScript = `(function(){var d=document.documentElement,a=${JSON.stringify(
  Object.values(AXES).map(({ attr, storageKey, values }) => [attr, storageKey, values]),
)},f=${JSON.stringify([DEFAULTS.themePref, DEFAULTS.palette, DEFAULTS.accent])};a.forEach(function(x,i){var v=f[i];try{var s=localStorage.getItem(x[1]);if(x[2].indexOf(s)>=0)v=s;}catch(e){}if(v==="system")v=window.matchMedia&&!window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"light":"dark";d.setAttribute(x[0],v);});d.setAttribute('data-density','regular');})();`;
