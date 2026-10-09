import type {
  OnboardingCriticalPathEntry,
  OnboardingDiagramEdge,
  OnboardingIndexDegradedReason,
  OnboardingIndexStatus,
  OnboardingReadingPathEntry,
  OnboardingRunCommand,
  OnboardingTour,
} from '@devdigest/shared';
import { OnboardingTour as OnboardingTourSchema } from '@devdigest/shared';
import type { DegradedReason, IndexStatus } from '../repo-intel/types.js';

/**
 * onboarding domain layer — PURE functions over data already in memory. No
 * I/O, no `Container`, no Drizzle, no `fs` (onion rule, see the per-module
 * layering table in the SPEC-06 Development Plan / `server/AGENTS.md`).
 * Every file read (`node:fs`) and every facade call
 * (`container.repoIntel.*`) lives in `service.ts`; this file only shapes the
 * bytes/strings it's handed.
 */

// ---------------------------------------------------------------------------
// Step 3 — reading path + critical paths (junk filtering, chain formatting).
// ---------------------------------------------------------------------------

/**
 * Path kinds excluded from the guided reading path and critical-paths list
 * (S-AC-10): tests, configs, declaration files, migrations, generated dirs.
 * Deliberately duplicated from `repo-intel/service.ts`'s own (unexported,
 * module-private) `isJunkPath` rather than imported — `getCriticalPaths`
 * does NOT apply this filter itself (only `getTopFilesByRank` does), so this
 * module has to post-apply it, and `repo-intel`'s internals aren't a stable
 * import surface (the facade only exports `types.ts`/`constants.ts`).
 */
const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Drop an ENTIRE chain if any node in it is junk (S-AC-10, S-AC-11) — never
 * splice a node out of the middle. A chain asserts a real import
 * relationship between consecutive entries; removing a middle node would
 * assert one that doesn't actually exist in the import graph.
 */
export function filterJunkChains(chains: readonly (readonly string[])[]): string[][] {
  return chains.filter((chain) => !chain.some((node) => isJunkPath(node))).map((chain) => [...chain]);
}

/** Render a dependency chain as "a → b → c" (one entry per chain). */
export function formatChain(chain: readonly string[]): string {
  return chain.join(' → ');
}

/**
 * Deterministic fallback node/edge list (S-AC-20 / C-AC-10) the client
 * renders as a text list whenever the model's `diagram_source` fails to
 * parse or render — built from the SAME deterministic facts already
 * collected (reading path + critical-path chains), never a fresh graph
 * query. Nodes = every file referenced by either fact; edges = each chain's
 * consecutive-pair adjacency, deduped.
 */
export function buildDiagramFallback(
  readingPathPaths: readonly string[],
  criticalPathChains: readonly (readonly string[])[],
): { nodes: string[]; edges: OnboardingDiagramEdge[] } {
  const nodeSet = new Set<string>(readingPathPaths);
  const edges: OnboardingDiagramEdge[] = [];
  const seenEdges = new Set<string>();
  for (const chain of criticalPathChains) {
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]!;
      const to = chain[i + 1]!;
      nodeSet.add(from);
      nodeSet.add(to);
      const key = `${from}>${to}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ from, to });
    }
  }
  return { nodes: [...nodeSet], edges };
}

// ---------------------------------------------------------------------------
// Step 4 — local-run facts (package.json / compose / .env.example parsing).
// ---------------------------------------------------------------------------

/** Script names from a `package.json`'s `scripts` block, in declared order.
 *  Malformed JSON / no scripts block → `[]` (AC-14's honest-empty path). */
export function parsePackageJsonScripts(content: string): string[] {
  try {
    const pkg = JSON.parse(content) as { scripts?: unknown };
    if (!pkg.scripts || typeof pkg.scripts !== 'object') return [];
    return Object.keys(pkg.scripts as Record<string, unknown>);
  } catch {
    return [];
  }
}

/**
 * Top-level service names under a compose file's `services:` block. Naive
 * indentation-based YAML scan (no YAML dependency added — none of this
 * feature's already-direct dependencies parse YAML) — assumes a
 * consistently-indented, comment-tolerant, standard compose layout. A file
 * that doesn't match that shape degrades to `[]` (AC-14), never throws.
 */
export function parseComposeServiceNames(content: string): string[] {
  const names: string[] = [];
  let inServices = false;
  let servicesIndent = -1;
  let serviceLevelIndent = -1;

  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;

    if (!inServices) {
      if (indent === 0 && /^services\s*:\s*$/.test(trimmed)) {
        inServices = true;
        servicesIndent = indent;
      }
      continue;
    }

    if (indent <= servicesIndent) {
      inServices = false;
      continue;
    }
    if (serviceLevelIndent === -1) serviceLevelIndent = indent;
    if (indent !== serviceLevelIndent) continue; // nested per-service config — skip

    const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:/);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

/** Every `KEY=` declared in an `.env.example`, verbatim and unfiltered
 *  (S-AC-13) — deduped by first occurrence, comments/blank lines skipped. */
export function parseEnvExampleKeys(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = m?.[1];
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Combine the three deterministic local-run sources into an ordered
 * `run_commands` list (S-AC-12, S-AC-14). Order: an `.env.example` copy step
 * first (the natural "set up before you run" step), then `package.json`
 * scripts in declared order, then one `docker compose up <service>` per
 * compose service. Any absent source contributes nothing — never
 * synthesized from another source (S-AC-12).
 */
export function buildRunCommands(
  inputs: {
    packageJsonContent: string | null;
    composeContent: string | null;
    envExampleContent: string | null;
  },
  maxCommands: number,
): OnboardingRunCommand[] {
  const commands: Omit<OnboardingRunCommand, 'order'>[] = [];

  if (inputs.envExampleContent != null) {
    commands.push({ command: 'cp .env.example .env', source: 'env_example' });
  }
  if (inputs.packageJsonContent != null) {
    for (const script of parsePackageJsonScripts(inputs.packageJsonContent)) {
      commands.push({ command: `npm run ${script}`, source: 'package_json' });
    }
  }
  if (inputs.composeContent != null) {
    for (const service of parseComposeServiceNames(inputs.composeContent)) {
      commands.push({ command: `docker compose up ${service}`, source: 'compose' });
    }
  }

  return commands.slice(0, maxCommands).map((c, i) => ({ ...c, order: i + 1 }));
}

// ---------------------------------------------------------------------------
// Step 5 — index-state facts (degraded-reason derivation).
// ---------------------------------------------------------------------------

export interface IndexDegradationInput {
  /** `container.config.repoIntelEnabled` — checked FIRST and overrides
   *  everything else (the flag gates the facade's array methods to `[]` but
   *  NOT `getIndexState()`, so without this a flag-off repo would report
   *  healthy-looking counts over an empty fact set — an honesty violation). */
  repoIntelEnabled: boolean;
  status: IndexStatus;
  degradedReason?: DegradedReason;
  filesIndexed: number;
  /** `repo-intel`'s `MAX_INDEXED_FILES` — a file count at/above this is a
   *  strong signal the walk was capped (S-AC-27's "exceeds the indexer's
   *  file cap" edge case), used as a best-effort `repo_too_large` reason
   *  since the facade's `IndexState` doesn't expose the raw "was bounded"
   *  flag from `repo_index_state.stats` (no facade signature change). */
  maxIndexedFiles: number;
}

export interface IndexDegradation {
  status: OnboardingIndexStatus;
  reason: OnboardingIndexDegradedReason | null;
}

/**
 * Derive the tour's `index_status`/`index_degraded_reason` (S-AC-15,
 * S-AC-23, S-AC-25, S-AC-27). This module treats `partial` as degraded
 * (unlike `repo-intel`'s own facade, which only flags `degraded: true` for
 * `degraded`/`failed` — `partial` is "still a working index" there). The
 * onboarding spec is stricter: any non-`full` state gets an index-derived
 * reason so a partially-covered tour never reads as complete.
 */
export function deriveIndexDegradation(input: IndexDegradationInput): IndexDegradation {
  if (!input.repoIntelEnabled) {
    return { status: 'degraded', reason: 'flag_off' };
  }
  if (input.status === 'full') {
    return { status: 'full', reason: null };
  }
  if (input.degradedReason) {
    return { status: input.status, reason: input.degradedReason };
  }
  if (input.filesIndexed >= input.maxIndexedFiles) {
    return { status: input.status, reason: 'repo_too_large' };
  }
  if (input.status === 'partial') {
    return { status: 'partial', reason: 'index_partial' };
  }
  if (input.status === 'failed') {
    return { status: 'failed', reason: 'index_failed' };
  }
  return { status: 'degraded', reason: 'no_data' };
}

// ---------------------------------------------------------------------------
// Step 7 — provenance + the model-response zip.
// ---------------------------------------------------------------------------

/** `blob_ref`/`blob_ref_kind` for deep-linking (S-AC-20-adjacent
 *  provenance) — a real commit sha when available, else the default
 *  branch name so a link can still be built. */
export function resolveBlobRef(
  currentSha: string | null,
  defaultBranch: string,
): { blob_ref: string; blob_ref_kind: 'sha' | 'branch' } {
  if (currentSha) return { blob_ref: currentSha, blob_ref_kind: 'sha' };
  return { blob_ref: defaultBranch, blob_ref_kind: 'branch' };
}

/**
 * Zip the model's `reading_path_rationales` onto the server's own
 * deterministic `reading_path` entries, defensively (step 7b): a
 * short/long array from the model never discards the tour — the remainder
 * just gets `rationale: null` (the field is already `.nullish()`).
 */
export function zipReadingPathRationales(
  entries: readonly { position: number; path: string }[],
  rationales: readonly string[] | null | undefined,
): OnboardingReadingPathEntry[] {
  return entries.map((e, i) => ({
    position: e.position,
    path: e.path,
    rationale: rationales?.[i] ?? null,
  }));
}

/** Same defensive zip as above, for `critical_path_reasons` onto
 *  server-collected dependency chains. */
export function zipCriticalPathReasons(
  chains: readonly (readonly string[])[],
  reasons: readonly string[] | null | undefined,
): OnboardingCriticalPathEntry[] {
  return chains.map((chain, i) => ({
    chain: [...chain],
    reason: reasons?.[i] ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Step 7b — S-AC-19 post-parse prose containment scan.
// ---------------------------------------------------------------------------

/** A repo-path-shaped substring: at least one `/`-separated segment,
 *  ending in a dotted extension. Deliberately scoped to `/`-containing
 *  tokens (not bare filenames like `README.md`) to keep the heuristic from
 *  flagging ordinary prose (version strings, abbreviations, etc). */
const PATH_LIKE_RE = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,10}\b/g;
const PATH_SHAPED_FULL_RE = /^(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,10}$/;

interface MdSegment {
  text: string;
  isCode: boolean;
}

/** Split markdown into alternating plain-text / inline-code-span segments
 *  (inline code = single backtick spans; fenced code blocks aren't expected
 *  in these short prose fields, so aren't specially handled). */
function splitCodeSpans(md: string): MdSegment[] {
  return md.split(/(`[^`\n]*`)/g).map((part) => {
    if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
      return { text: part.slice(1, -1), isCode: true };
    }
    return { text: part, isCode: false };
  });
}

export interface ProseScanResult {
  text: string;
  /** Inline-code path-shaped occurrences NOT in the allowed set — stripped
   *  of their code-span formatting (rendered as inert plain text). */
  strippedCount: number;
  /** Plain-text path-shaped occurrences NOT in the allowed set — counted
   *  and logged, never mutated (rewriting free text risks corrupting an
   *  otherwise-legitimate sentence). */
  detectedCount: number;
}

/**
 * S-AC-19's post-parse containment scan for ONE prose field. Matches
 * repo-path-shaped substrings in both inline-code tokens and unformatted
 * plain text (the AC's wording has no formatting qualifier). Any match not
 * in `allowedPaths` (the server's own deterministic fact-set paths) is:
 *   - inline-code: stripped of its code-span formatting.
 *   - plain-text: left as-is, only counted.
 * `diagram_source` is deliberately never passed through this scan — see
 * `service.ts`'s call site for why (S-AC-19's exemption).
 */
export function scanAndSanitizeProse(md: string, allowedPaths: ReadonlySet<string>): ProseScanResult {
  let strippedCount = 0;
  let detectedCount = 0;

  const rendered = splitCodeSpans(md)
    .map((part) => {
      if (part.isCode) {
        const trimmed = part.text.trim();
        if (PATH_SHAPED_FULL_RE.test(trimmed) && !allowedPaths.has(trimmed)) {
          strippedCount += 1;
          return trimmed; // formatting stripped — inert plain text, no longer "a repo file"
        }
        return `\`${part.text}\``;
      }
      const matches = part.text.match(PATH_LIKE_RE) ?? [];
      for (const m of matches) {
        if (!allowedPaths.has(m)) detectedCount += 1;
      }
      return part.text;
    })
    .join('');

  return { text: rendered, strippedCount, detectedCount };
}

export interface ProseFields {
  architecture_md: string | null;
  critical_paths_md: string | null;
  run_locally_md: string | null;
  reading_path_md: string | null;
  first_tasks_md: string | null;
}

export interface ProseScanSummary {
  sanitized: ProseFields;
  strippedCount: number;
  detectedCount: number;
}

/** Runs `scanAndSanitizeProse` over the five prose fields (never
 *  `diagram_source`) and combines the strip/detect counts so the S-AC-19
 *  guarantee is observable from a single run summary. */
export function scanProseFieldsForHallucinatedPaths(
  fields: ProseFields,
  allowedPaths: ReadonlySet<string>,
): ProseScanSummary {
  let strippedCount = 0;
  let detectedCount = 0;
  const sanitized = {} as ProseFields;

  for (const key of Object.keys(fields) as (keyof ProseFields)[]) {
    const value = fields[key];
    if (value == null) {
      sanitized[key] = value;
      continue;
    }
    const result = scanAndSanitizeProse(value, allowedPaths);
    sanitized[key] = result.text;
    strippedCount += result.strippedCount;
    detectedCount += result.detectedCount;
  }

  return { sanitized, strippedCount, detectedCount };
}

// ---------------------------------------------------------------------------
// Persistence shaping (pure — the actual read/write lives in repository.ts).
// ---------------------------------------------------------------------------

/** Validate a raw `onboarding.json` blob against the current contract.
 *  `null` on a schema mismatch (a future shape change the `schema_version`
 *  field exists to detect) rather than throwing — this module is the sole
 *  writer, so a mismatch here means "not the current shape", treated the
 *  same as "no tour yet" by callers. */
export function parseTourJson(json: unknown): OnboardingTour | null {
  const parsed = OnboardingTourSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
