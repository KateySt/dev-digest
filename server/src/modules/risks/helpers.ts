import { MAX_FILES, MAX_PATCH_CHARS_PER_FILE } from './constants.js';

/** Pure helpers for the risks module — no I/O. */

export interface PrFileLike {
  path: string;
  patch: string | null;
}

/** Render up to `MAX_FILES` changed files' patches as untrusted diff blocks
 *  for the risk-derivation prompt, each capped at `MAX_PATCH_CHARS_PER_FILE`
 *  so one huge file can't starve the rest of the diff's context. */
export function renderDiffBlocks(files: PrFileLike[]): string {
  return files
    .filter((f) => !!f.patch)
    .slice(0, MAX_FILES)
    .map((f) => `### ${f.path}\n\`\`\`diff\n${(f.patch as string).slice(0, MAX_PATCH_CHARS_PER_FILE)}\n\`\`\``)
    .join('\n\n');
}
