import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { HOST } from './config';

/** The API clones and diffs repos through the system `git` (simple-git); it isn't bundled. */
export function hasGit(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['--version'], { timeout: 5000, windowsHide: true }, (err) => resolve(!err));
  });
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, HOST);
  });
}

/**
 * GUI apps on macOS start with a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
 * so a Homebrew git would be invisible. Add the usual install dirs.
 */
export function augmentedPath(): string {
  const current = process.env.PATH ?? '';
  if (process.platform !== 'darwin') return current;
  const extra = ['/opt/homebrew/bin', '/usr/local/bin'].filter((p) => !current.split(':').includes(p));
  return [...extra, current].filter(Boolean).join(':');
}
