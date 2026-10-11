// electron-builder afterPack hook: copy the staged node_modules into the
// packaged resources. extraResources always drops node_modules (no filter
// pattern brings them back), but the API needs its natives/wasm and the Next
// standalone server needs its traced deps at runtime.
const { cpSync, existsSync } = require('node:fs');
const { join } = require('node:path');

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
    cpSync(from, join(resources, name, 'node_modules'), { recursive: true });
  }
};
