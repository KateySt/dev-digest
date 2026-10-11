# Performance — startup and responsiveness

Source: electronjs.org/docs/latest/tutorial/performance. Measure first
(`--cpu-prof`, DevTools Performance tab); optimize what the profile shows.

## F1 — Get pixels on screen fast

- Show something immediately: a lightweight splash or the main window with
  `show: false` + `ready-to-show` + `backgroundColor`.
- Start independent work in parallel (`Promise.all` over child health checks),
  not sequentially.
- Defer anything the first screen doesn't need: update checks, telemetry,
  background downloads, heavy `require`s (`const x = await import('x')` at the
  point of use).

## Main process

- No sync I/O or CPU loops (processes-lifecycle.md P1).
- Vet dependencies: count transitive deps and `require` cost before adding one;
  prefer built-ins (`fetch`, `net`, `fs/promises`) over server-oriented packages.
- Bundle the main process into few files when startup `require` time shows up
  in profiles; with a small `tsc` output (DevDigest) it isn't worth it.

## Renderer

- Long CPU work → Web Worker; small idle work → `requestIdleCallback`.
- Don't polyfill what the bundled Chromium already has; target the Chromium
  version from `process.versions.chrome`.
- Bundle static assets (fonts, icons) with the app — no CDN fonts.

## Menus

`Menu.setApplicationMenu(null)` before `ready` skips building the default menu.

**Exceptions**
- If you rely on menu accelerators (copy/paste, reload, devtools), build your
  own menu and hide it instead (DevDigest E4).

## Memory

- Remove IPC / `webContents` listeners when windows close; drop references to
  closed windows (`mainWindow = undefined` on `closed`).
- Destroy splash/hidden windows when done (`destroy()`, not just `hide()`).
- Polling intervals in main: one `setInterval` per concern, created once.
