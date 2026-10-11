# desktop/ — insights

Running log of non-obvious learnings, gotchas, and "why it's built this way"
decisions that would otherwise get lost in git history. One entry per
learning, newest first. Once something becomes obvious from the code or
README, delete the entry instead of letting it go stale.

## Format

```
### YYYY-MM-DD — short title
What happened / what we learned, and why it matters for future work here.
```

---

### 2026-10-11 — Packaging gotchas from the first Windows build

- **`extraResources` silently drops every `node_modules` folder**, even with
  `filter: ["**/*", "**/node_modules/**/*"]`. The packaged app then dies with
  `ERR_MODULE_NOT_FOUND`, though `pnpm start` works. `scripts/after-pack.cjs`
  copies them in instead. After packaging, check
  `release/win-unpacked/resources/{server,web}/node_modules`.
- **`ELECTRON_RUN_AS_NODE=1` turns any Electron binary into plain Node.** Emdash
  (and other Electron-hosted terminals) export it, so `electron .` or
  `DevDigest.exe` exits at once and `electron --version` prints the Node version.
  Launch with `env -u ELECTRON_RUN_AS_NODE …`. End users don't have it set.
- **Emdash keeps every `.asar` file in its worktree open**, so electron-builder
  fails with `EBUSY`/`EPERM` on `app.asar` or `default_app.asar` the second time.
  Locally, build outside the worktree:
  `electron-builder --publish never -c.directories.output="$TEMP/dd-release"`.
  CI is unaffected.
- **pnpm 11+ ignores `.npmrc`** (`node-linker=hoisted` included) and only reads
  `pnpm-workspace.yaml`. That's why `nodeLinker: hoisted` lives in both files
  here and in `client/`: pnpm 10 in CI reads `.npmrc`, a newer local pnpm reads
  the yaml.
- **Build approvals use two keys.** `allowBuilds` is pnpm 11+ and
  `onlyBuiltDependencies` is pnpm 10. Without them electron's postinstall never
  downloads the binary, and `pnpm start` fails. Packaging still works because
  electron-builder downloads its own Electron.
