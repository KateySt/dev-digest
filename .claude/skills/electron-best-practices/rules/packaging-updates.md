# Packaging, fuses, signing, updates, upgrades

## B1 — Flip fuses at package time

Fuses are bits in the Electron binary, flipped after packaging and **before
signing**. electron-builder (≥ 25) does it from config:

```yaml
# electron-builder.yml
electronFuses:
  runAsNode: false                           # ELECTRON_RUN_AS_NODE ignored; child_process.fork throws
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false       # no --inspect / SIGUSR1 debugger
  onlyLoadAppFromAsar: true                  # pair with integrity, else it is bypassable
  enableEmbeddedAsarIntegrityValidation: true
  grantFileProtocolExtraPrivileges: false    # unless pages are served from file://
  # enableCookieEncryption: true             # signed builds only — one-way switch
```

Verify on the artifact: `npx @electron/fuses read --app <path to exe or .app>`.

**Exceptions**
- `runAsNode` stays on only if the app really uses `child_process.fork` of
  Electron itself. `utilityProcess` does **not** need it.
- `enableCookieEncryption`: needs Keychain on macOS → a real signature. Once on,
  turning it off corrupts the cookie store. Skip on unsigned builds (DevDigest E3).
- `asar: false` or `asar.disableIntegrity: true` make integrity meaningless —
  don't pair them with the integrity fuse and claim protection.
- Code outside `app.asar` (`extraResources`, DevDigest E2) is never covered by
  ASAR integrity.
- Ad-hoc-signed macOS arm64 builds: flipping fuses invalidates Electron's
  original ad-hoc signature — set `resetAdHocDarwinSignature: true` (or make
  sure electron-builder re-signs with `identity: "-"` afterwards), otherwise the
  app is reported as "damaged".

Test a packaged build after flipping fuses — a fuse breaking startup only shows
up there, never under `electron .`.

## Packaging

- Ship only built output: `files: [dist/**, package.json]`. Never ship sources,
  `.env`, tests, or dev dependencies.
- Native modules must match Electron's ABI — let electron-builder rebuild them
  (`npmRebuild`), or package prebuilt binaries for each target arch.
- Unpack (`asarUnpack`) only what must be real files (native `.node`, binaries
  you spawn).
- Build each OS on its own CI runner; mac signing checks (symlinks, deep
  verification) can't be reproduced on Windows.
- Check the packaged layout (`win-unpacked/resources/...`) after changing
  `files`/`extraResources` — missing `node_modules` only fails at runtime.

## Code signing

| Platform | Ideal | Consequence without |
|----------|-------|---------------------|
| Windows | Authenticode (EV/OV or Azure Trusted Signing) + `publisherName` | SmartScreen warning; updater can't verify publisher |
| macOS | Developer ID + hardened runtime + notarization | Gatekeeper prompt; **no** Squirrel.Mac auto-install; arm64 needs at least ad-hoc (`identity: "-"`) |

**Exceptions:** free-tier/unsigned releases are a valid product decision
(DevDigest E3). Then: no signing requirements in CI, ad-hoc on macOS, no
hardened runtime (it rejects third-party-signed native addons), and document
the first-launch steps for users.

## B3 — Updates (electron-updater)

- Initialize only when `app.isPackaged`; check **after** the window is shown, then
  on an interval (hours, not minutes).
- Route `autoUpdater.logger` to electron-log; handle `error` (never let it crash).
- Ask before `quitAndInstall()`; otherwise `autoInstallOnAppQuit` installs on
  next quit. Make sure the quit sequence (P3) lets it through.
- Windows NSIS per-user (`perMachine: false`) → silent updates without UAC.
- Staged rollout: `stagingPercentage` in `latest.yml`. To pull a bad release,
  ship a **higher** version — don't delete it.
- With a certificate, keep signature verification on (`publisherName`; in
  electron-builder 27 the hook is `verifyUpdateFileAuthenticodeSignature`).
- macOS without a Developer ID: auto-install is impossible — compare with the
  latest release and open the download page instead.
- Release flow: draft release → upload all platforms' artifacts + `latest*.yml`
  → publish. Users must never see a release missing its yml.

## B2 — Electron upgrades

- Stay within the three supported majors (Oct 2026: 44 / 43 / 42). Old Chromium
  = known exploits.
- One major at a time; read "Breaking changes" for each.
- Recent ones that bite:
  - 44: renderer `clipboard` removed (use `navigator.clipboard`); clipboard API
    is Promise-based; macOS 13+ only; preload runs only in top-level / DevTools
    `chrome-extension` frames.
  - 43: dialog `defaultPath` defaults to Downloads.
  - 42: `electron` npm package no longer downloads its binary in `postinstall`
    (`npx install-electron`); macOS notifications via `UNNotification`.
  - 38: `utilityProcess` unhandled rejections only warn; macOS 12+ only.
- Bump `electron` and `electron-builder`/`electron-updater` together and run a
  full packaged build on every OS before tagging.
