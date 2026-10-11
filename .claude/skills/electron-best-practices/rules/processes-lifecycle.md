# Processes and app lifecycle

## P1 — Never block the main process

The main process runs the UI event loop for every window. Blocking it freezes
the whole app (and on Windows, "Not responding").

Forbidden in IPC handlers, event handlers, timers, and anything after the main
window is shown: `fs.*Sync`, `child_process.execSync/spawnSync`, long CPU
loops, `ipcRenderer.sendSync` targets. Also: awaiting slow network before
showing any window.

Move heavy work to: a `utilityProcess` (Node service, crash-isolated) →
`worker_threads` (CPU-bound, shares the process) → a hidden window only as a
last resort.

**Exceptions**
- One-time boot setup before the main window is shown — paths, a config read,
  `mkdirSync` of data/log dirs, opening log streams. A splash may be visible;
  that's fine.

## P2 — Child processes

| Child | API |
|-------|-----|
| Node.js service shipped with the app | `utilityProcess.fork(entry, args, { serviceName, stdio: 'pipe', env })` |
| External binary (git, ffmpeg) | `child_process.spawn` (async), with an explicit `PATH` |
| Node script via `child_process.fork` | Avoid — needs the `runAsNode` fuse, which should be off |

Rules for `utilityProcess` children:
- Pipe `stdout`/`stderr` to a log file; `exit` code goes to the main log.
- Health-check readiness (poll an HTTP `/health` or wait for a message) with a
  timeout, and fail fast if the child exits during startup.
- Watch for unexpected exit after startup and surface it to the user.
- Since Electron 38, an unhandled rejection in a utility process only **warns**.
  If the service must die on one, add
  `process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); })`.
- `process.exit()` in a utility process is synchronous since 38 — flush logs first.
- Pass configuration via `env`, never via renderer-reachable channels.

## P3 — Quit sequence

```ts
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;          // re-entry guard: app.quit() fires before-quit again
  quitting = true;
  event.preventDefault();
  void Promise.allSettled([stop(api, true), stop(web, false)]).finally(() => app.quit());
});
```

- Graceful first (message/signal), `kill()` after a timeout.
- On Windows `kill()` gives the child **no** chance to clean up — a DB-owning
  child (DevDigest API with PGlite) must get the `shutdown` message.
- `autoUpdater.quitAndInstall()` goes through `before-quit` too; the guard must
  not block it forever (always resolve via timeout).
- `window-all-closed`: quit except on macOS; `activate`: recreate the window.

## P4 — Single instance

Call `app.requestSingleInstanceLock()` before `whenReady`; quit if it fails;
focus the existing window on `second-instance`. Required whenever the app owns
fixed ports or a single-writer data dir.

**Exceptions:** apps designed for multiple concurrent instances (none here).

## Startup failures

- Pre-flight before spawning: ports free, required external tools present.
- On fatal errors: log, show `dialog.showErrorBox` with the log path, quit.
- Don't throw from `whenReady().then(...)` without a `.catch` — it becomes an
  unhandled rejection with a blank app.

## Paths & logs

- Dev runs (`!app.isPackaged`) use a separate `userData` so they never touch the
  installed app's data. Call `app.setPath('userData', …)` before `whenReady`.
- Logs via `electron-log` (`log.initialize()` once, early). Never log secrets or
  full environment.

## Notifications

- Windows: `app.setAppUserModelId(appId)` first thing, matching
  electron-builder's `appId`, or toasts from the installed app never show.
- Keep a reference to each `Notification` until `close`/`click`, or it can be
  garbage-collected before `click` fires.
- macOS (Electron ≥ 42, `UNNotification`): unsigned/ad-hoc apps may emit
  `failed` — listen for it, log, and release the reference (same cleanup as
  `close`).
- Check `Notification.isSupported()`; don't notify while the window is focused
  if the UI already shows the event.
