import { app } from 'electron';
import log from 'electron-log/main';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { oneOf } from './validate';

export const THEME_SOURCES = ['dark', 'light', 'system'] as const;
export type ThemeSource = (typeof THEME_SOURCES)[number];

/** Shell-level settings the main process needs before the studio has loaded. */
export interface DesktopPrefs {
  /** Last mode the studio reported — picks the window background on the next boot. */
  themeSource: ThemeSource;
  /** Windows/Linux: closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean;
  /** The one-time "still running in the tray" toast has been shown. */
  trayHintShown: boolean;
  /** Last keyboard bindings from the studio (SPEC-11 D-8) — re-validated by keybindings.ts on load. */
  keybindings: unknown;
}

const DEFAULTS: DesktopPrefs = { themeSource: 'dark', closeToTray: true, trayHintShown: false, keybindings: null };

let prefs: DesktopPrefs = { ...DEFAULTS };
const file = () => join(app.getPath('userData'), 'desktop-prefs.json');

/** Sync read — called once in boot(), before the window is shown (P1 exception: one-time boot setup). */
export function loadPrefs(): DesktopPrefs {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>;
    prefs = {
      themeSource: oneOf(raw.themeSource, THEME_SOURCES) ? raw.themeSource : DEFAULTS.themeSource,
      closeToTray: typeof raw.closeToTray === 'boolean' ? raw.closeToTray : DEFAULTS.closeToTray,
      trayHintShown: raw.trayHintShown === true,
      keybindings: raw.keybindings ?? null,
    };
  } catch {
    // Missing or corrupt file → defaults.
  }
  return prefs;
}

export function getPrefs(): DesktopPrefs {
  return prefs;
}

export function updatePrefs(patch: Partial<DesktopPrefs>): DesktopPrefs {
  prefs = { ...prefs, ...patch };
  writeFile(file(), `${JSON.stringify(prefs, null, 2)}\n`).catch((err: Error) =>
    log.warn('could not save desktop prefs:', err.message),
  );
  return prefs;
}
