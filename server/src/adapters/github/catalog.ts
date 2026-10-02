import type { CatalogSource, CatalogRepoRef, CatalogTreeEntry } from '@devdigest/shared';

// Bounded-fetch discipline matching `importFromUrl`'s IMPORT_URL_TIMEOUT_MS /
// IMPORT_URL_MAX_BYTES guards (server spec NFR "Bounded external reads").
const TREE_TIMEOUT_MS = 10_000;
const BODY_TIMEOUT_MS = 5_000;
const BODY_MAX_BYTES = 200_000;

/**
 * Unauthenticated GitHub REST reads for the public community skill catalog
 * (SPEC-07). Deliberately NOT `OctokitGitHubClient` / `container.github()` —
 * that throws a `ConfigError` when `GITHUB_TOKEN` is unset, which would make
 * this tokenless-by-design feature unavailable in exactly the local-first
 * setup this app targets. Uses plain `fetch` against the public REST API,
 * reusing the same bounded-fetch discipline as `importFromUrl`'s
 * `IMPORT_URL_TIMEOUT_MS`/`IMPORT_URL_MAX_BYTES` guards (see
 * `modules/skills/constants.ts`'s `CATALOG_*` constants) — never a direct
 * `fetch` call from the service layer itself (onion-architecture: the
 * service depends on the `CatalogSource` port, not this adapter).
 */
export class GitHubCatalogSource implements CatalogSource {
  /**
   * One recursive tree request, resolved against the repo's default branch
   * via the literal `HEAD` ref (SPEC-07 S-AC-5) — avoids a separate request
   * to look up the default branch name first.
   */
  async listTree(repo: CatalogRepoRef): Promise<CatalogTreeEntry[]> {
    const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
      repo.name,
    )}/git/trees/HEAD?recursive=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TREE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'devdigest' },
      });
      if (!res.ok) {
        throw new Error(`GitHub tree request failed: HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tree?: { path: string; type: string }[] };
      return (data.tree ?? [])
        .filter((e): e is { path: string; type: 'blob' | 'tree' } => e.type === 'blob' || e.type === 'tree')
        .map((e) => ({ path: e.path, type: e.type }));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * One entry's raw body, via the Contents API (defaults to the repo's
   * default branch when no `ref` is given — same one-request default-branch
   * resolution as `listTree`). Lazy — only ever called per-import (S-AC-18),
   * never during listing (S-AC-5). Time-bounded and byte-capped.
   */
  async fetchBody(repo: CatalogRepoRef, path: string): Promise<string> {
    const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
      repo.name,
    )}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BODY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'devdigest' },
      });
      if (!res.ok) {
        throw new Error(`GitHub content request failed: HTTP ${res.status}`);
      }
      const text = await res.text();
      return text.length > BODY_MAX_BYTES ? text.slice(0, BODY_MAX_BYTES) : text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
