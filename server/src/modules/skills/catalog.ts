import type { CatalogTreeEntry } from '@devdigest/shared';
import { SkillType, type SkillType as SkillTypeT } from '@devdigest/shared';
import { nameFromMarkdown } from './helpers.js';

/**
 * Pure catalog layout-contract parser (SPEC-07 S-AC-9 – S-AC-14). No HTTP,
 * no Drizzle, no Octokit — takes already-fetched tree entries and already-
 * fetched entry text, returns parsed data. Every function here is
 * deterministic and side-effect-free so it's unit-testable without a mock
 * network.
 */

export interface CatalogEntryPath {
  path: string;
  folder: string;
}

/**
 * AC-9/AC-10: a file is a catalog entry only if it has a `.md` extension and
 * sits exactly one level below the repository root; `README.md` is excluded
 * even then. Deeper nesting and non-`.md` files are silently ignored, not
 * errors (edge case: "deeper nesting is silently ignored").
 */
export function selectCatalogEntryPaths(tree: CatalogTreeEntry[]): CatalogEntryPath[] {
  const out: CatalogEntryPath[] = [];
  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const segments = entry.path.split('/');
    if (segments.length !== 2) continue; // exactly one level below root
    const [folder, filename] = segments;
    if (!folder || !filename) continue;
    if (!filename.toLowerCase().endsWith('.md')) continue;
    if (filename === 'README.md') continue;
    out.push({ path: entry.path, folder });
  }
  return out;
}

export interface ParsedCatalogEntry {
  path: string;
  folder: string;
  name: string;
  description: string;
  tags: string[];
  type: SkillTypeT;
}

interface RawFrontmatter {
  type?: unknown;
  tags?: unknown;
  description?: unknown;
}

/**
 * Minimal hand-rolled YAML frontmatter extractor — intentionally NOT a
 * general YAML parser (no new runtime dependency). Supports exactly the
 * shapes a catalog author needs: a `---`-delimited block at the top of the
 * file, scalar `key: value` lines (quoted or bare), an inline flow list
 * (`tags: [a, b]`), and a block list (`tags:` followed by indented `- item`
 * lines). Anything else is left unparsed, which resolves as an absent field
 * — never a listing-wide failure (edge case: "frontmatter that parses but
 * has wrong types").
 */
function splitFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { frontmatter: null, body: raw };
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closeIdx === -1) return { frontmatter: null, body: raw };
  const frontmatter = lines.slice(1, closeIdx).join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');
  return { frontmatter, body };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseFrontmatterFields(block: string): RawFrontmatter {
  const lines = block.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (key !== 'type' && key !== 'tags' && key !== 'description') continue;
    const value = m[2]!.trim();

    if (value === '') {
      // Possible YAML block list on following indented `- item` lines.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s*/.test(lines[j]!)) {
        items.push(stripQuotes(lines[j]!.replace(/^\s*-\s*/, '')));
        j++;
      }
      if (items.length > 0) {
        result[key] = items;
        i = j - 1;
      }
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      result[key] = inner.trim().length === 0 ? [] : inner.split(',').map((s) => stripQuotes(s));
      continue;
    }

    result[key] = stripQuotes(value);
  }
  return result;
}

/**
 * AC-11 – AC-14: resolve one entry's name/description/tags/type from its
 * folder, frontmatter, and body. Pure — no I/O. A malformed/wrong-typed
 * frontmatter field degrades to that field's absent-default alone (via
 * `safeParse`-equivalent type checks below), never a whole-entry failure.
 */
export function parseCatalogEntry(path: string, folder: string, rawBody: string): ParsedCatalogEntry {
  const filename = path.split('/').pop()!;
  const fallbackName = filename.replace(/\.md$/i, '');
  const { frontmatter, body } = splitFrontmatter(rawBody);
  const fields: RawFrontmatter = frontmatter !== null ? parseFrontmatterFields(frontmatter) : {};

  // AC-13: invalid/missing `type` → 'custom'.
  const typeResult = SkillType.safeParse(fields.type);
  const type: SkillTypeT = typeResult.success ? typeResult.data : 'custom';

  // AC-12: missing/wrong-typed `description` → ''.
  const description = typeof fields.description === 'string' ? fields.description : '';

  // AC-11/AC-12: frontmatter tags (if an array of strings) + the folder name,
  // deduplicated. Folder tag is always present, with or without frontmatter.
  const frontmatterTags = Array.isArray(fields.tags)
    ? fields.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const tags = [...new Set([folder, ...frontmatterTags])];

  // AC-14: first markdown heading, falling back to the filename.
  const name = nameFromMarkdown(body, fallbackName);

  return { path, folder, name, description, tags, type };
}
