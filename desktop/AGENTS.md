# desktop/ — @devdigest/desktop

Full picture: README.md (architecture, local build, release) — read it first.

## Stack

Electron 44 + electron-builder (NSIS on Windows, dmg on macOS) +
electron-updater. Plain `tsc` → CommonJS in `dist/`. No renderer code: the
window loads the Next.js studio served by a child process.

## Commands

`pnpm typecheck` · `pnpm stage` (needs `server/dist-desktop` and
`client/.next/standalone` built first) · `pnpm start` · `pnpm dist`

## Where things live

- `src/main.ts` — lifecycle: single-instance lock, preflight, children, window, quit
- `src/processes.ts` — `utilityProcess` fork/stop of the API and the studio, logs
- `src/updater.ts` — Windows auto-update / macOS "new version" check
- `src/config.ts` — fixed ports, GitHub repo, data paths
- `src/preload.ts` + `src/ipc.ts` — `window.devdigestDesktop` bridge: custom
  title-bar window controls, the former Help-menu actions, and OS
  notifications (`app:notify`, click → `app:navigate`). Channel names are
  duplicated in both files — a sandboxed preload can't import `ipc.ts`
- `scripts/stage.mjs` — builds `resources/` (gitignored)
- `scripts/after-pack.cjs` — copies `node_modules` into the packaged resources
- `../.github/workflows/release.yml` — tag → draft release → build → publish

## Non-default conventions

- Ports 43100/43101 are a contract with the client build
  (`NEXT_PUBLIC_API_BASE`) and the release workflow — change all three together.
- The API child must be stopped with `stop(api, true)` (graceful `shutdown`
  message), never a bare `kill()` — PGlite can lose writes otherwise.
- The window is frameless (`titleBarStyle: 'hidden'`): the studio's top bar is
  the title bar (`.app-drag` regions, `WindowControls` in `client/`). Any new
  full-screen page without the AppShell needs `<TitlebarStrip />`, or the
  window can't be moved or closed there.
- Release assets are unsigned on purpose (free tier). Don't add signing
  requirements; macOS uses ad-hoc `identity: "-"`.

## Gotchas

Read `INSIGHTS.md` before starting work here.
