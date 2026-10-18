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
  title-bar window controls, the former Help-menu actions, OS notifications
  (`app:notify`, click → `app:navigate`), activity, prefs, theme source, deep
  links. Channel names are duplicated in both files — a sandboxed preload
  can't import `ipc.ts`. Every bridge change also lands in
  `client/src/lib/desktop.ts` and `client/src/test/fake-desktop-bridge.ts`
- `src/validate.ts` — `isOwnOrigin`, `isStudioRoute`, `openExternalSafe`, … —
  use these for every IPC arg / URL instead of ad-hoc checks
- `src/tray.ts`, `src/taskbar.ts`, `src/activity.ts` — tray, taskbar progress
  and badge, both rendering the activity the studio pushes
- `src/menu.ts` + `src/keybindings.ts` — native menu commands and the global
  Show/Hide shortcut (SPEC-11): the studio owns the keyboard registry and
  sends bindings over `app:set-keybindings`; main re-validates them, builds
  accelerators, sends `app:command <id>` back. Command ids are duplicated
  from `client/src/components/keyboard/registry.ts` — keep them in sync
- `src/deep-link.ts`, `src/theme.ts`, `src/context-menu.ts`, `src/prefs.ts`
  (`desktop-prefs.json`), `src/secrets-key.ts` (safeStorage key for secrets.json)
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

Read `INSIGHTS.md` before starting work here. Load the
`electron-best-practices` skill before changing anything in `src/` or
`electron-builder.yml` — its E1–E5 list is the set of approved deviations.
