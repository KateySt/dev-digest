import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ConfigError } from '../../platform/errors.js';

/**
 * Port for the committed CI runner bundle (`agent-runner/bundle/runner.mjs`).
 * Server-local on purpose (not in vendored shared): only the ci service needs
 * it, and it keeps `fs` out of the service. The bytes are shipped to target
 * repos unchanged, so callers must not transform them.
 */
export interface RunnerBundleProvider {
  load(): Promise<Uint8Array>;
}

const here = dirname(fileURLToPath(import.meta.url));
/** server/src/adapters/runner-bundle → repo root → agent-runner/bundle/runner.mjs */
const DEFAULT_BUNDLE_PATH = resolve(here, '../../../../agent-runner/bundle/runner.mjs');

export class FsRunnerBundleProvider implements RunnerBundleProvider {
  constructor(private readonly path: string = DEFAULT_BUNDLE_PATH) {}

  async load(): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.path));
    } catch {
      throw new ConfigError(
        'The CI runner bundle (agent-runner/bundle/runner.mjs) was not found. Build it with `pnpm build` in agent-runner/.',
      );
    }
  }
}
