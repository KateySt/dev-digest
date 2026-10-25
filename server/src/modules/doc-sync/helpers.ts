import { posix } from 'node:path';
import type { DocSyncFinding } from '@devdigest/shared';
import {
  CATCH_UP_WINDOW_MS,
  COMMON_SCRIPTS,
  DOC_SKIP_SEGMENTS,
  GENERATED_SEGMENTS,
  PM_BUILTINS,
  TRACKED_DOT_DIRS,
} from './constants.js';

/**
 * Docs Sync — pure decisions (no fs, no DB): schedule maths and the
 * deterministic doc checks. `repository.ts` walks/reads the clone,
 * `service.ts` orchestrates.
 */

// ---------------------------------------------------------------- schedule

export interface ScheduleRule {
  enabled: boolean;
  time: string; // HH:mm
  days: number[]; // ISO weekdays, empty = every day
  timezone: string;
}

/** Offset (ms) of `tz` from UTC at instant `at`: local wall-clock − UTC. */
function tzOffsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` reads y-m-d hh:mm. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes: the offset at the guess can differ from the offset at the
  // answer across a DST switch.
  let utc = naive - tzOffsetMs(naive, tz);
  utc = naive - tzOffsetMs(utc, tz);
  return new Date(utc);
}

/** Calendar date (y, m, d) the wall clock in `tz` shows at `at`. */
function zonedDate(at: Date, tz: string): { y: number; m: number; d: number } {
  const local = new Date(at.getTime() + tzOffsetMs(at.getTime(), tz));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

/** Next occurrence of the rule strictly after `from`; null while disabled. */
export function nextOccurrence(rule: ScheduleRule, from: Date): Date | null {
  if (!rule.enabled) return null;
  const [hh, mm] = rule.time.split(':').map(Number) as [number, number];
  const today = zonedDate(from, rule.timezone);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (rule.days.length > 0 && !rule.days.includes(isoWeekday)) continue;
    const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, rule.timezone);
    if (at.getTime() > from.getTime()) return at;
  }
  return null;
}

/** What `next_run_at` should be: a future one-off override wins over the rule. */
export function computeNextRunAt(rule: ScheduleRule & { nextRunOverride: Date | null }, now: Date): Date | null {
  if (!rule.enabled) return null;
  if (rule.nextRunOverride && rule.nextRunOverride.getTime() > now.getTime()) return rule.nextRunOverride;
  return nextOccurrence(rule, now);
}

export type TickDecision = 'wait' | 'run' | 'missed';

/** Due within the catch-up window → run; due longer ago → missed (skip it). */
export function decideTick(nextRunAt: Date | null, now: Date): TickDecision {
  if (!nextRunAt || nextRunAt.getTime() > now.getTime()) return 'wait';
  return now.getTime() - nextRunAt.getTime() <= CATCH_UP_WINDOW_MS ? 'run' : 'missed';
}

// ---------------------------------------------------------------- doc checks

/** Which markdown files count as documentation. */
export function isDocPath(rel: string): boolean {
  if (!/\.md$/i.test(rel)) return false;
  const segments = rel.split('/');
  const base = segments[segments.length - 1]!;
  if (/^(changelog|license|licence)/i.test(base)) return false;
  if (segments.slice(0, -1).some((s) => DOC_SKIP_SEGMENTS.has(s))) return false;
  if (segments.length === 1) return true;
  if (/^(readme.*|agents)\.md$/i.test(base)) return true;
  return segments[0] === 'docs';
}

export interface CheckContext {
  /** Repo-relative paths of every file and directory in the clone. */
  paths: ReadonlySet<string>;
  /** Same paths grouped by last segment — see `buildPathIndex`. */
  byBasename: ReadonlyMap<string, string[]>;
  /** Every script name declared in any package.json of the repo. */
  scripts: ReadonlySet<string>;
  /** False when the repo has no package.json — script checks are skipped. */
  hasPackageJson: boolean;
}

/** Paths grouped by basename, for the suffix match in `pathExists`. */
export function buildPathIndex(paths: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const p of paths) {
    const base = p.slice(p.lastIndexOf('/') + 1);
    const list = index.get(base);
    if (list) list.push(p);
    else index.set(base, [p]);
  }
  return index;
}

/**
 * Does a backticked path exist anywhere it could reasonably mean? Docs write
 * paths relative to the repo root, to their own folder, or to a module root
 * (`modules/x/service.ts` inside `server/AGENTS.md`), so any path ending in
 * the same segments counts.
 */
function pathExists(code: string, ctx: CheckContext): boolean {
  const clean = code.replace(/^(\.\.?\/)+/, '').replace(/\/$/, '');
  if (!clean) return true;
  if (ctx.paths.has(clean)) return true;
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  return (ctx.byBasename.get(base) ?? []).some((p) => p.endsWith(`/${clean}`));
}

const LINK_RE = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const PATH_LIKE_RE = /^[\w.-]+(?:\/[\w.@\-[\]]+)+\/?$/;
const PM_CMD_RE = /\b(pnpm|npm|yarn)\s+((?:run\s+)?)([\w-]+(?::[\w-]+)*)(?![\w:*-])/g;

/** Resolve `target` against the doc's folder (or the repo root for `/x`).
 *  Null when it escapes the repo — those point at GitHub pages, not files. */
function resolveInRepo(docPath: string, target: string): string | null {
  const joined = target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(docPath), target);
  const norm = posix.normalize(joined).replace(/\/$/, '');
  if (norm === '.' || norm === '') return '';
  if (norm.startsWith('../') || norm === '..') return null;
  return norm;
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//');
}

function looksGenerated(rel: string): boolean {
  return rel
    .split('/')
    .some((s) => GENERATED_SEGMENTS.has(s) || (s.startsWith('.') && s !== '.' && s !== '..' && !TRACKED_DOT_DIRS.has(s)));
}

function checkLinks(docPath: string, line: string, lineNo: number, ctx: CheckContext, out: DocSyncFinding[]): void {
  for (const m of line.matchAll(LINK_RE)) {
    const raw = m[1]!;
    if (isExternal(raw)) continue;
    const target = safeDecode(raw.split('#')[0]!.split('?')[0]!);
    if (!target) continue;
    const resolved = resolveInRepo(docPath, target);
    if (resolved === null || resolved === '' || looksGenerated(resolved)) continue;
    if (!ctx.paths.has(resolved)) out.push({ path: docPath, line: lineNo, kind: 'broken_link', target: raw });
  }
}

function checkInlinePaths(docPath: string, line: string, lineNo: number, ctx: CheckContext, out: DocSyncFinding[]): void {
  for (const m of line.matchAll(INLINE_CODE_RE)) {
    // Drop a `:line` / `:line-line` suffix (`src/app.ts:42`).
    const code = m[1]!.trim().replace(/:\d+(?:-\d+)?$/, '');
    if (!PATH_LIKE_RE.test(code)) continue;
    const last = code.replace(/\/$/, '').split('/').pop()!;
    // Only things that are clearly paths: a file with a word-like extension
    // (not a version such as `claude-haiku-4.5`), or a dir/.
    if (!code.endsWith('/') && !/\.[a-z][a-z0-9]{0,6}$/i.test(last)) continue;
    // Placeholders (`specs/<name>.md`, `NN-name.flow.json`) aren't real paths.
    if (/[<>{}*$]|\bNN\b/.test(code) || looksGenerated(code)) continue;
    const fromDoc = resolveInRepo(docPath, code);
    if (fromDoc !== null && ctx.paths.has(fromDoc)) continue;
    if (!pathExists(code, ctx)) out.push({ path: docPath, line: lineNo, kind: 'missing_path', target: code });
  }
}

function checkScripts(docPath: string, text: string, lineNo: number, ctx: CheckContext, out: DocSyncFinding[]): void {
  if (!ctx.hasPackageJson) return;
  for (const m of text.matchAll(PM_CMD_RE)) {
    const [, pm, run, name] = m as unknown as [string, string, string, string];
    if (name.startsWith('-')) continue;
    // Without an explicit `run`, `pnpm x` may be a package binary (`pnpm vitest`):
    // only check names that look like scripts.
    if (!run && (PM_BUILTINS.has(name) || (!name.includes(':') && !COMMON_SCRIPTS.has(name)))) continue;
    if (pm === 'npm' && !run && name !== 'test' && name !== 'start') continue;
    if (!ctx.scripts.has(name)) out.push({ path: docPath, line: lineNo, kind: 'unknown_script', target: `${pm} ${run}${name}` });
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** All deterministic findings for one doc, deduped per (kind, target). */
export function checkDoc(docPath: string, content: string, ctx: CheckContext): DocSyncFinding[] {
  const out: DocSyncFinding[] = [];
  let fence: string | null = null;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(fence)) fence = null;
      return;
    }
    if (fence !== null) {
      // Inside a code block only shell commands are meaningful.
      checkScripts(docPath, line, lineNo, ctx, out);
      return;
    }
    checkLinks(docPath, line, lineNo, ctx, out);
    checkInlinePaths(docPath, line, lineNo, ctx, out);
    for (const m of line.matchAll(INLINE_CODE_RE)) checkScripts(docPath, m[1]!, lineNo, ctx, out);
  });
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.kind}\0${f.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Repo-relative forms a link/path finding can resolve to — used to drop
 * findings that point at git-ignored runtime output (`results/x.jsonl`).
 */
export function findingPathForms(f: DocSyncFinding): string[] {
  if (f.kind === 'unknown_script') return [];
  const target = f.target.split('#')[0]!.split('?')[0]!;
  const forms = [resolveInRepo(f.path, target), f.kind === 'missing_path' ? resolveInRepo(f.path, `/${target}`) : null];
  // Keep a directory's trailing slash: `dir/` ignore rules only match it then.
  const dir = target.endsWith('/') ? '/' : '';
  return [...new Set(forms.filter((p): p is string => Boolean(p)).map((p) => p + dir))];
}

// ---------------------------------------------------------------- LLM stage

/** Existing repo paths with the same basename as a missing one — fix hints. */
export function pathCandidates(target: string, byBasename: ReadonlyMap<string, string[]>, limit = 3): string[] {
  const clean = target.split('#')[0]!.replace(/\/$/, '');
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  return (byBasename.get(base) ?? []).slice(0, limit);
}

/** Split `git diff` output into per-file chunks keyed by the new path. */
export function splitRawDiff(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of raw.split(/^(?=diff --git )/m)) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
    if (m) out.set(m[2]!, chunk);
  }
  return out;
}

/**
 * Does a change to `changed` plausibly affect the doc? It does when the doc
 * mentions the path (from the root or from the doc's folder), or — for a file
 * that no longer exists (deleted / moved) — when the doc is the README/AGENTS
 * of a folder containing it.
 */
export function docRelatesTo(docPath: string, content: string, changed: string, stillExists: boolean): boolean {
  const docDir = posix.dirname(docPath);
  const relative = docDir === '.' ? changed : posix.relative(docDir, changed);
  if (content.includes(changed) || (!relative.startsWith('..') && content.includes(relative))) return true;
  if (stillExists) return false;
  const base = docPath.slice(docPath.lastIndexOf('/') + 1);
  return /^(readme.*|agents)\.md$/i.test(base) && (docDir === '.' || changed.startsWith(`${docDir}/`));
}

// ---------------------------------------------------------------- diagrams

const MERMAID_BLOCK_RE = /^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

/** Sources of every ```mermaid fenced block in a markdown text. */
export function mermaidBlocks(markdown: string): string[] {
  return [...markdown.matchAll(MERMAID_BLOCK_RE)].map((m) => m[1]!.replace(/\n$/, ''));
}

// Strict subset the editor may write — anything outside it is rejected rather
// than shipped to GitHub as a broken render.
const NODE_ID = String.raw`[A-Za-z_][\w-]*`;
// Unquoted labels can't contain brackets/quotes (Mermaid parse errors); quoted ones can't contain ".
const LABEL = String.raw`(?:"[^"\n]*"|[^\[\](){}"|\n]+)`;
const SHAPE = String.raw`(?:\[\[${LABEL}\]\]|\[\(${LABEL}\)\]|\(\[${LABEL}\]\)|\(\(${LABEL}\)\)|\[${LABEL}\]|\(${LABEL}\)|\{${LABEL}\})`;
const NODE = `${NODE_ID}(?:${SHAPE})?`;
const LINK = String.raw`(?:-->|---|-\.->|==>)(?:\|${LABEL}\|)?`;
const FLOW_HEADER_RE = /^(?:flowchart|graph)\s+(?:TD|TB|LR|RL|BT)$/;
const FLOW_LINE_RE = new RegExp(String.raw`^${NODE}(?:\s*${LINK}\s*${NODE})*$`);
const FLOW_SUBGRAPH_RE = new RegExp(String.raw`^subgraph\s+${NODE_ID}(?:\s*\[${LABEL}\])?$`);
const SEQ_LINE_RES = [
  /^autonumber$/,
  new RegExp(String.raw`^(?:participant|actor)\s+${NODE_ID}(?:\s+as\s+[^\n;]+)?$`),
  new RegExp(String.raw`^${NODE_ID}\s*(?:->>|-->>|->|-->|-x|--x|-\)|--\))\s*[+-]?${NODE_ID}\s*:\s*[^\n;]*$`),
  new RegExp(String.raw`^[Nn]ote\s+(?:left of|right of|over)\s+${NODE_ID}(?:\s*,\s*${NODE_ID})?\s*:\s*[^\n;]*$`),
  new RegExp(String.raw`^(?:activate|deactivate)\s+${NODE_ID}$`),
  /^(?:alt|else|opt|loop|par|and|critical|break|rect)\b[^\n;]*$/,
  /^end$/,
];

/**
 * Null when `source` is a valid diagram in the subset (`flowchart`/`graph`
 * with plain nodes, edges and subgraphs, or a basic `sequenceDiagram`) within
 * the size caps; otherwise the reason it was rejected. No styling, click
 * handlers, HTML or init directives — they are where untrusted text would hide.
 */
export function validateMermaid(source: string, maxLines: number, maxNodes: number): string | null {
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'));
  if (lines.length < 2) return 'empty diagram';
  if (lines.length > maxLines) return `more than ${maxLines} lines`;
  if (/<[a-z/!]|%%\{|\bclick\b|\bstyle\b|classDef|linkStyle|:::/i.test(source)) return 'styling, HTML or directives';
  const [header, ...body] = lines as [string, ...string[]];

  if (FLOW_HEADER_RE.test(header)) {
    let depth = 0;
    const nodes = new Set<string>();
    for (const line of body) {
      if (FLOW_SUBGRAPH_RE.test(line)) depth++;
      else if (line === 'end') {
        if (--depth < 0) return 'unbalanced end';
      } else if (FLOW_LINE_RE.test(line)) {
        for (const m of line.matchAll(new RegExp(String.raw`(?:^|${LINK}\s*)(${NODE_ID})`, 'g'))) nodes.add(m[1]!);
      } else return `unsupported line: ${line.slice(0, 60)}`;
    }
    if (depth !== 0) return 'unclosed subgraph';
    return nodes.size > maxNodes ? `more than ${maxNodes} nodes` : null;
  }

  if (header === 'sequenceDiagram') {
    let depth = 0;
    for (const line of body) {
      if (!SEQ_LINE_RES.some((re) => re.test(line))) return `unsupported line: ${line.slice(0, 60)}`;
      if (/^(?:alt|opt|loop|par|critical|break|rect)\b/.test(line)) depth++;
      if (line === 'end' && --depth < 0) return 'unbalanced end';
    }
    return depth === 0 ? null : 'unclosed block';
  }
  return 'only flowchart and sequenceDiagram are allowed';
}

export interface SearchReplaceEdit {
  find: string;
  replace: string;
}

/** Apply edits in order; an edit whose `find` is missing or ambiguous is skipped. */
export function applyEdits(content: string, edits: SearchReplaceEdit[]): { content: string; applied: number } {
  let out = content;
  let applied = 0;
  for (const e of edits) {
    if (!e.find || e.find === e.replace) continue;
    const at = out.indexOf(e.find);
    if (at === -1 || out.indexOf(e.find, at + 1) !== -1) continue;
    out = out.slice(0, at) + e.replace + out.slice(at + e.find.length);
    applied++;
  }
  return { content: out, applied };
}

/** Does the edit add or change a diagram (writes a fence, or its `find` sits inside one)? */
export function touchesDiagram(content: string, edit: SearchReplaceEdit): boolean {
  if (edit.replace.includes('```')) return true;
  const at = content.indexOf(edit.find);
  if (at === -1) return false;
  return [...content.matchAll(MERMAID_BLOCK_RE)].some((m) => at < m.index! + m[0].length && at + edit.find.length > m.index!);
}

/**
 * Why the diagrams the edit introduced can't ship, or null when they can: every
 * new/changed block must validate, and at most one new block per doc.
 */
export function diagramProblem(before: string, after: string, maxLines: number, maxNodes: number): string | null {
  const existing = new Set(mermaidBlocks(before));
  const added = mermaidBlocks(after).filter((b) => !existing.has(b));
  if (added.length > 1) return 'more than one new diagram';
  for (const block of added) {
    const problem = validateMermaid(block, maxLines, maxNodes);
    if (problem) return problem;
  }
  return null;
}

/** Lines removed + lines added between two texts (multiset line diff). */
export function changedLineCount(before: string, after: string): number {
  const count = (text: string) => {
    const m = new Map<string, number>();
    for (const l of text.split(/\r?\n/)) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  let changed = 0;
  for (const [line, n] of a) changed += Math.max(0, n - (b.get(line) ?? 0));
  for (const [line, n] of b) changed += Math.max(0, n - (a.get(line) ?? 0));
  return changed;
}

/** Deterministic findings the edit introduced (a new broken link, a made-up path, …). */
export function newFindings(before: DocSyncFinding[], after: DocSyncFinding[]): DocSyncFinding[] {
  const known = new Set(before.map((f) => `${f.kind}\0${f.target}`));
  return after.filter((f) => !known.has(`${f.kind}\0${f.target}`));
}

export interface PrDocSummary {
  path: string;
  issues: { claim: string; problem: string }[];
}

function cell(text: string, max = 160): string {
  const one = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** Short PR description: what changed, why, and how to review it. */
export function buildPrBody(input: { sha: string; docs: PrDocSummary[]; remainingFindings: number }): string {
  const rows = input.docs.flatMap((d) =>
    d.issues.map((i) => `| \`${d.path}\` | ${cell(i.claim)} | ${cell(i.problem)} |`),
  );
  const lines = [
    `Documentation that no longer matched the code at \`${input.sha.slice(0, 7)}\`, fixed with minimal edits.`,
    '',
    '| File | Was | Now |',
    '|---|---|---|',
    ...rows,
    '',
  ];
  if (input.remainingFindings > 0) {
    lines.push(
      `${input.remainingFindings} other finding(s) (broken links, missing paths, unknown scripts) were not fixed automatically — see Settings → Docs sync in DevDigest.`,
      '',
    );
  }
  lines.push(
    '**Review checklist**',
    '- [ ] Each change matches the code',
    '- [ ] Nothing else in the files changed',
    '',
    '_Generated by DevDigest Docs Sync. This PR is never merged automatically; the next run updates it in place._',
  );
  return lines.join('\n');
}
