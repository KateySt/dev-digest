import { shell } from 'electron';
import log from 'electron-log/main';
import { WEB_ORIGIN } from './config';

/**
 * Guards for everything that crosses into the main process — IPC arguments,
 * URLs the window navigates to, deep links. Each takes `unknown`: the renderer
 * and the OS hand us untrusted input.
 */

/** True when `raw` parses and its origin is exactly the studio's (never a string prefix). */
export function isOwnOrigin(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    return new URL(raw).origin === WEB_ORIGIN;
  } catch {
    return false;
  }
}

/** A relative studio route (`/repos/…`): one leading slash, no scheme or `//host`, bounded length. */
export function isStudioRoute(v: unknown, max = 512): v is string {
  return typeof v === 'string' && v.length <= max && /^\/(?![/\\])[^\s]*$/.test(v);
}

/** `v` as an integer clamped to [min, max], or `fallback` when it isn't a finite number. */
export function clampInt(v: unknown, min: number, max: number, fallback = min): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export function oneOf<T extends string>(v: unknown, values: readonly T[]): v is T {
  return typeof v === 'string' && (values as readonly string[]).includes(v);
}

/** Open a URL in the default browser — https only; anything else is dropped and logged. */
export function openExternalSafe(raw: unknown): void {
  if (typeof raw !== 'string') return;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') {
      void shell.openExternal(url.toString());
      return;
    }
  } catch {
    // fall through
  }
  log.warn('blocked external URL:', raw.slice(0, 200));
}
