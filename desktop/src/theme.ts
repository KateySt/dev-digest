import { BrowserWindow, nativeTheme } from 'electron';
import { type ThemeSource, getPrefs, updatePrefs } from './prefs';

/** Window background per resolved mode — the studio's `--bg-primary` (client/src/app/globals.css). */
const BACKGROUND = { dark: '#0a0a0a', light: '#ffffff' } as const;

/** Background for the current native theme, used before the studio has painted. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
}

/** Apply the saved source at boot, so menus, dialogs and the splash match from the first frame. */
export function initTheme(): void {
  nativeTheme.themeSource = getPrefs().themeSource;
  // "system" + an OS switch: keep the background behind the studio in step.
  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(windowBackground());
  });
}

/** The studio changed its mode (Settings → Appearance). */
export function setThemeSource(win: BrowserWindow, source: ThemeSource): void {
  nativeTheme.themeSource = source;
  win.setBackgroundColor(windowBackground());
  if (getPrefs().themeSource !== source) updatePrefs({ themeSource: source });
}
