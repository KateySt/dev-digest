// electron-builder afterPack hook: copy the staged node_modules into the
// packaged resources. extraResources always drops node_modules (no filter
// pattern brings them back), but the API needs its natives/wasm and the Next
// standalone server needs its traced deps at runtime.
//
// No symlinks may end up in the bundle: fs.cpSync rewrites relative links
// (node_modules/.bin/*) to ABSOLUTE paths into the build dir, and macOS
// `codesign --verify --strict` rejects the .app ("invalid destination for
// symbolic link in bundle"). So .bin (CLI shims, unused at runtime) is skipped
// and every other link is copied as the real file/dir it points to.
const { cpSync, existsSync, lstatSync } = require('node:fs');
const { basename, join } = require('node:path');

/** Skip CLI shim dirs and dangling links (dereferencing those would throw). */
function keep(src) {
  if (basename(src) === '.bin') return false;
  return !lstatSync(src).isSymbolicLink() || existsSync(src);
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resources =
    electronPlatformName === 'darwin'
      ? join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(appOutDir, 'resources');
  const staged = join(packager.projectDir, 'resources');
  for (const name of ['server', 'web']) {
    const from = join(staged, name, 'node_modules');
    if (!existsSync(from)) throw new Error(`afterPack: ${from} is missing — run \`pnpm stage\` first`);
    cpSync(from, join(resources, name, 'node_modules'), { recursive: true, dereference: true, filter: keep });
  }
};
