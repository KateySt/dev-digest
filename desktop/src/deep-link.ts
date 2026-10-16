import { app, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { resolve } from 'node:path';
import { isStudioRoute } from './validate';

export const PROTOCOL = 'devdigest';

/**
 * `devdigest://` links. The URL comes from outside the app (a browser, another
 * program, a crafted page), so it is untrusted: it can only *navigate* the
 * studio — never start a review, spend LLM tokens or write anything.
 *
 *   devdigest://open?path=/repos/<id>/pulls        → that studio route
 *   devdigest://pr?url=https://github.com/o/r/pull/12 → that PR, if its repo is added
 */
export type DeepLink =
  | { kind: 'navigate'; href: string }
  | { kind: 'open-pr'; owner: string; repo: string; number: number };

const GITHUB_PR = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/(\d{1,9})(?:[/?#].*)?$/;

export function parseDeepLink(raw: unknown): DeepLink | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:`) return null;
  // `devdigest://open?…` puts the action in the host; tolerate `devdigest:open?…` too.
  const action = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();

  if (action === 'open') {
    const href = url.searchParams.get('path');
    return isStudioRoute(href) ? { kind: 'navigate', href } : null;
  }
  if (action === 'pr') {
    const m = GITHUB_PR.exec(url.searchParams.get('url') ?? '');
    if (!m) return null;
    return { kind: 'open-pr', owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
  }
  return null;
}

/** The first `devdigest://` argument (Windows/Linux pass the link on the command line). */
export function deepLinkFromArgv(argv: readonly string[]): string | undefined {
  return argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}://`));
}

/** Register as the OS handler. Packaged Windows/macOS also get it from the installer / Info.plist. */
export function registerProtocol(): void {
  const ok = app.isPackaged
    ? app.setAsDefaultProtocolClient(PROTOCOL)
    : // `pnpm start`: electron.exe needs the app path, or it would open the default app.
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1] ?? '.')]);
  if (!ok) log.warn(`could not register ${PROTOCOL}:// handler`);
}

/**
 * Links arrive before the studio is ready (cold start takes seconds: API,
 * PGlite, Next). Queue them and deliver once the window has loaded.
 */
let target: BrowserWindow | undefined;
let pending: DeepLink[] = [];

export function handleDeepLink(raw: unknown): void {
  const link = parseDeepLink(raw);
  if (!link) {
    if (raw) log.warn('ignored deep link:', String(raw).slice(0, 200));
    return;
  }
  pending.push(link);
  flush();
}

/** The studio window finished loading — deliver anything queued, and future links. */
export function setDeepLinkTarget(win: BrowserWindow): void {
  target = win;
  win.once('closed', () => {
    if (target === win) target = undefined;
  });
  flush();
}

function flush(): void {
  if (!target || target.isDestroyed() || target.webContents.isLoading()) return;
  for (const link of pending) {
    if (link.kind === 'navigate') target.webContents.send('app:navigate', link.href);
    else target.webContents.send('app:open-pr', { owner: link.owner, repo: link.repo, number: link.number });
  }
  pending = [];
}
