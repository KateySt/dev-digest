/**
 * Minimal repo-path glob matcher, shared by the server (memory retrieval) and
 * the CI runner (memory.jsonl filtering) — SPEC-2026-10-12-memory.
 *
 * Supports `**` (any number of path segments, including none), `*` (anything
 * except `/`) and `?` (one non-`/` char). Every other character is literal.
 * No dependency on purpose: the runner bundle must stay self-contained.
 */

const cache = new Map<string, RegExp>();

function globToRegExp(glob: string): RegExp {
  const hit = cache.get(glob);
  if (hit) return hit;
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` → zero or more whole segments; a trailing `**` → the rest.
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const compiled = new RegExp(`^${re}$`);
  cache.set(glob, compiled);
  return compiled;
}

/** True when `path` matches at least one glob; an empty list matches everything. */
export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  if (globs.length === 0) return true;
  return globs.some((g) => globToRegExp(g).test(path));
}
