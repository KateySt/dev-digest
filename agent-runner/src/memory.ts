import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Reads the checked-in `.devdigest/memory.jsonl` (one curated memory item per
 * non-empty line) into the `string[]` shape `reviewPullRequest({ memory })`
 * expects. A missing or empty file yields `[]` — the studio exports it empty
 * (there is no memory store yet), and a repo may legitimately delete it.
 *
 * A line that is a JSON string literal is unwrapped; any other line is used
 * verbatim. The content is untrusted repo data: `assemblePrompt` fences it.
 */
export function loadMemory(
  devdigestDir: string,
  readFile: typeof readFileSync = readFileSync,
): string[] {
  let raw: string;
  try {
    raw = readFile(path.join(devdigestDir, 'memory.jsonl'), 'utf8') as unknown as string;
  } catch {
    return [];
  }
  const items: string[] = [];
  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (!text) continue;
    try {
      const parsed: unknown = JSON.parse(text);
      items.push(typeof parsed === 'string' ? parsed : text);
    } catch {
      items.push(text);
    }
  }
  return items;
}
