# IPC and the preload bridge

Sources: electronjs.org/docs/latest/tutorial/ipc, /context-isolation, /sandbox.

## I1 — One function per action

```ts
// preload.ts — sandboxed: may only require 'electron', 'events', 'timers', 'url'
contextBridge.exposeInMainWorld('devdigestDesktop', {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openLogsFolder: () => ipcRenderer.invoke('app:open-logs'),
});
```

Never:

```ts
contextBridge.exposeInMainWorld('api', ipcRenderer);                       // whole module
contextBridge.exposeInMainWorld('api', { invoke: (c, ...a) => ipcRenderer.invoke(c, ...a) }); // generic channel
```

A generic passthrough lets any script in the page call every handler you will
ever register.

Type the bridge for the renderer with a `declare global { interface Window { … } }`
in the client (keep it next to the code that calls it).

**Exceptions:** none.

## I2 — Never leak `IpcRendererEvent`

```ts
onNavigate(cb: (href: string) => void): () => void {
  const listener = (_e: IpcRendererEvent, href: string) => cb(href);
  ipcRenderer.on('app:navigate', listener);
  return () => ipcRenderer.removeListener('app:navigate', listener);
}
```

`event.sender` is the `ipcRenderer` itself. Always return an unsubscribe so
React effects can clean up (otherwise listeners pile up on every remount).

## I3 — Pick the right primitive

| Need | Use |
|------|-----|
| Renderer asks, main answers | `ipcRenderer.invoke` ↔ `ipcMain.handle` |
| Renderer notifies, no answer | `ipcRenderer.send` ↔ `ipcMain.on` |
| Main pushes to a window | `win.webContents.send` ↔ wrapped `ipcRenderer.on` |
| Streams / renderer↔utility process | `MessageChannelMain` ports |

Forbidden: `ipcRenderer.sendSync` (blocks the renderer), `@electron/remote`,
`event.reply` request/response patterns, `ipcRenderer.sendTo` (removed).

Only structured-clone data crosses IPC — no `BrowserWindow`, DOM nodes,
`process.env`, class instances with prototypes, functions, or symbols.
Errors thrown in `handle` reach the renderer as **message only**; return a
result object when the UI must branch on the error kind.

## I4 — Validate the sender, by origin

```ts
function ownWindow(e: IpcMainInvokeEvent): BrowserWindow | null {
  const frame = e.senderFrame;            // null if the frame is gone
  if (!frame) return null;
  let origin: string;
  try { origin = new URL(frame.url).origin; } catch { return null; }
  if (origin !== WEB_ORIGIN) return null;
  return BrowserWindow.fromWebContents(e.sender);
}
```

- Compare **origin**, never `url.startsWith(...)`: `http://127.0.0.1:43100@evil.com/`
  starts with `http://127.0.0.1:43100` but its origin is `http://evil.com`.
- `about:blank`, `blob:`, and sandboxed iframes don't identify their creator —
  they fail the check by design.
- Decide whether subframes may call privileged handlers; if not, also require
  `frame === e.sender.mainFrame`.

Wrap every handler in one helper (like DevDigest's `handle()`) so a new channel
can't forget the check.

**Exceptions:** handlers returning only static public data may skip it, but
using the shared helper costs nothing — prefer it.

## I5 — Validate the payload

Type every handler argument as `unknown` and narrow it:

- strings: type check + length clip;
- enums: membership in a `Set`;
- paths / URLs: parse, then allowlist (relative routes `^/(?!/)`, `https:` only);
- never pass a renderer string into `shell.openPath`, `fs`, `child_process`, or SQL.

Declare the parameter as `unknown`. `arg as Foo` followed by narrowing every
field is tolerated (SUGGESTION); `arg as Foo` with any field used un-narrowed
is a violation.

**Exceptions:** none.

## Channel naming

`domain:action` (`window:minimize`, `app:notify`). Names are labels only —
prefixes grant nothing. When the preload is sandboxed it can't import the
main-process module, so the list is duplicated (DevDigest E5) — change both
files in the same commit.
