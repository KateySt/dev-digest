import { isAbsolute, relative, resolve } from 'node:path';
import type { Intent, IssueMeta } from '@devdigest/shared';
import { MIN_DOC_CHARS, SPEC_REF_PATTERN } from './constants.js';

/**
 * Pure helpers for the intent module — no I/O. `detectSpecRef` +
 * `resolveSpecPath` are split so the path-traversal guard is unit-testable
 * (and reviewable) independent of the regex that finds the candidate.
 */

/**
 * Find a same-repo spec/plan doc reference in a PR body: a token that looks
 * like `specs/…/*.md` or `docs/…/*.md`. Explicitly rejects any token that's
 * part of an external URL (contains `://`) — only a same-repo relative path
 * counts as a spec reference.
 */
export function detectSpecRef(body: string | null | undefined): string | null {
  if (!body) return null;
  const tokens = body.split(/[\s()<>[\]"'`]+/);
  for (const raw of tokens) {
    const token = raw.replace(/[.,;:]+$/, '');
    if (!token || token.includes('://')) continue;
    if (SPEC_REF_PATTERN.test(token)) return token;
  }
  return null;
}

/**
 * Path-traversal guard for `container.git.readFile`, which does a bare
 * `join(clonePath, path)` with no protection of its own. Rejects an absolute
 * path or any `..` segment, and double-checks the resolved path actually
 * stays under `clonePath`. Returns the normalized (forward-slash) relative
 * path to read, or `null` when the reference isn't safe to use.
 */
export function resolveSpecPath(clonePath: string, refPath: string): string | null {
  const normalized = refPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  const root = resolve(clonePath);
  const target = resolve(root, normalized);
  const rel = relative(root, target).replace(/\\/g, '/');
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return normalized;
}

/**
 * Decides high- vs low-confidence: is there enough real documentation (PR
 * body or the linked issue's body) to derive intent from direct signals,
 * rather than falling back to indirect ones (diff shape, commit messages)?
 * Code-derived — never asked of or trusted from the model.
 */
export function hasRealDocumentation(
  body: string | null | undefined,
  linkedIssue: IssueMeta | null | undefined,
): boolean {
  if ((body ?? '').trim().length >= MIN_DOC_CHARS) return true;
  return (linkedIssue?.body ?? '').trim().length >= MIN_DOC_CHARS;
}

/**
 * Flatten the structured `Intent` into the text block fed into the main
 * reviewer prompt (as the untrusted `## PR intent` section).
 */
export function renderIntentDigest(intent: Intent): string {
  const lines: string[] = [`Intent: ${intent.intent}`];
  if (intent.in_scope.length > 0) {
    lines.push('In scope:');
    lines.push(...intent.in_scope.map((s) => `- ${s}`));
  }
  if (intent.out_of_scope.length > 0) {
    lines.push('Out of scope:');
    lines.push(...intent.out_of_scope.map((s) => `- ${s}`));
  }
  lines.push(
    intent.confidence === 'low'
      ? 'Confidence: LOW — derived from indirect signals (no clear PR documentation); treat as a hint, not a fact.'
      : 'Confidence: high — derived from the PR description and/or its linked ticket/spec.',
  );
  if (intent.spec_ref) lines.push(`Spec reference: ${intent.spec_ref}`);
  return lines.join('\n');
}
