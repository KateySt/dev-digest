/* theme.tsx — appearance via attributes on <html>, read by globals.css:
   data-theme (mode: dark | light), data-palette (surface family) and
   data-accent (brand colour). Each is persisted separately in localStorage. */
"use client";

import React from "react";

export const THEME_MODES = ["dark", "light"] as const;
export const THEME_PALETTES = ["classic", "stone"] as const;
export const THEME_ACCENTS = ["blue", "indigo", "violet", "emerald"] as const;

export type Theme = (typeof THEME_MODES)[number];
export type ThemePalette = (typeof THEME_PALETTES)[number];
export type ThemeAccent = (typeof THEME_ACCENTS)[number];

interface Appearance {
  theme: Theme;
  palette: ThemePalette;
  accent: ThemeAccent;
}

const DEFAULTS: Appearance = { theme: "dark", palette: "classic", accent: "blue" };

/** <html> attribute + localStorage key per appearance axis. */
const AXES = {
  theme: { attr: "data-theme", storageKey: "dd-theme", values: THEME_MODES },
  palette: { attr: "data-palette", storageKey: "dd-palette", values: THEME_PALETTES },
  accent: { attr: "data-accent", storageKey: "dd-accent", values: THEME_ACCENTS },
} as const;

type Axis = keyof typeof AXES;

interface ThemeContextValue extends Appearance {
  toggle: () => void;
  set: (t: Theme) => void;
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

function readAttr<A extends Axis>(axis: A): Appearance[A] {
  const { attr, values } = AXES[axis];
  const v = document.documentElement.getAttribute(attr);
  return ((values as readonly string[]).includes(v ?? "") ? v : DEFAULTS[axis]) as Appearance[A];
}

function apply<A extends Axis>(axis: A, value: Appearance[A]) {
  document.documentElement.setAttribute(AXES[axis].attr, value);
  try {
    localStorage.setItem(AXES[axis].storageKey, value);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearance] = React.useState<Appearance>(DEFAULTS);

  // hydrate from the attributes set by the no-FOUC inline script
  React.useEffect(() => {
    setAppearance({ theme: readAttr("theme"), palette: readAttr("palette"), accent: readAttr("accent") });
  }, []);

  const update = React.useCallback(<A extends Axis>(axis: A, value: Appearance[A]) => {
    apply(axis, value);
    setAppearance((prev) => ({ ...prev, [axis]: value }));
  }, []);

  const set = React.useCallback((t: Theme) => update("theme", t), [update]);
  const setPalette = React.useCallback((p: ThemePalette) => update("palette", p), [update]);
  const setAccent = React.useCallback((a: ThemeAccent) => update("accent", a), [update]);
  const toggle = React.useCallback(() => {
    set(appearance.theme === "dark" ? "light" : "dark");
  }, [appearance.theme, set]);

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
)},f=${JSON.stringify(Object.values(DEFAULTS))};a.forEach(function(x,i){var v=f[i];try{var s=localStorage.getItem(x[1]);if(x[2].indexOf(s)>=0)v=s;}catch(e){}d.setAttribute(x[0],v);});d.setAttribute('data-density','regular');})();`;
