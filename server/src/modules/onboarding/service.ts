import { z } from 'zod';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  OnboardingCriticalPathEntry,
  OnboardingIndexStatus,
  OnboardingModelFailureReason,
  OnboardingReadingPathEntry,
  OnboardingRunCommand,
  OnboardingTour,
  StructuredResult,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { withTimeout, TimeoutError } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { MAX_INDEXED_FILES } from '../repo-intel/constants.js';
import { OnboardingRepository, type OnboardingRepoBasics } from './repository.js';
import {
  buildDiagramFallback,
  buildRunCommands,
  deriveIndexDegradation,
  filterJunkChains,
  formatChain,
  parseEnvExampleKeys,
  parseTourJson,
  resolveBlobRef,
  scanProseFieldsForHallucinatedPaths,
  zipCriticalPathReasons,
  zipReadingPathRationales,
} from './helpers.js';
import {
  GENERATE_JOB_KIND,
  GENERATION_DEADLINE_MS,
  MAX_ENV_KEYS_IN_PROMPT,
  MAX_LOCAL_RUN_FILE_BYTES,
  MAX_RUN_COMMANDS,
  ONBOARDING_SCHEMA_NAME,
  ONBOARDING_SCHEMA_VERSION,
  READING_PATH_SIZE,
} from './constants.js';
import { ONBOARDING_SYSTEM_PROMPT } from './prompts.js';

/**
 * OnboardingService — application layer. EVERY I/O call in this module lives
 * here (onion rule): `container.repoIntel.*`, clone file reads,
 * `container.llm(provider)`, `resolveFeatureModel`, and every
 * `OnboardingRepository` call. Orchestrates: collect deterministic facts →
 * one LLM call → persist. Depends on `Container` ports only, never concrete
 * adapters.
 */

/**
 * The LLM's response schema (step 7a/7b). Deliberately has NO path-typed
 * field — every path that becomes a list entry or a deep link is
 * server-supplied by construction (S-AC-19's structural enforcement); the
 * model only supplies prose plus two arrays INDEX-ALIGNED with the server's
 * own already-collected `reading_path`/`critical_paths` facts.
 */
const OnboardingModelResponse = z.object({
  architecture_md: z.string(),
  critical_paths_md: z.string(),
  run_locally_md: z.string(),
  reading_path_md: z.string(),
  first_tasks_md: z.string(),
  diagram_source: z.string(),
  reading_path_rationales: z.array(z.string()),
  critical_path_reasons: z.array(z.string()),
});
type OnboardingModelResponseT = z.infer<typeof OnboardingModelResponse>;

export type OnboardingReadResult =
  | { state: 'generated'; tour: OnboardingTour }
  | { state: 'not_generated' }
  | { state: 'no_clone' };

export type OnboardingGenerateResult = { jobId: string } | { degraded: true; reason: string };

export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  // -------------------------------------------------------------------------
  // Reads — a read NEVER starts generation (S-AC-1, S-AC-6).
  // -------------------------------------------------------------------------

  async getTour(repoId: string): Promise<OnboardingReadResult> {
    const json = await this.repo.getTourJson(repoId);
    const tour = json ? parseTourJson(json) : null;
    // While a job is in flight, this serves the PREVIOUSLY stored tour
    // unchanged (S-AC-5) — there is no "in progress" branch here at all,
    // by construction: the row is only ever replaced by the job's own
    // final persist write (upsertTour), never partially.
    if (tour) return { state: 'generated', tour };

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return { state: 'no_clone' };
    return { state: 'not_generated' };
  }

  // -------------------------------------------------------------------------
  // Generation request — enqueue only, S-AC-2/S-AC-3/S-AC-22.
  // -------------------------------------------------------------------------

  async requestGeneration(workspaceId: string, repoId: string): Promise<OnboardingGenerateResult> {
    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) {
      // No clone → refuse to enqueue, not an error (S-AC-22).
      return { degraded: true, reason: 'no_clone' };
    }

    const inFlight = await this.repo.findInFlightJob(repoId);
    if (inFlight) {
      // Don't enqueue a second job — return the in-flight job's id (S-AC-3).
      return { jobId: inFlight.id };
    }

    try {
      const job = await this.container.jobs.enqueue(workspaceId, GENERATE_JOB_KIND, { repoId, workspaceId });
      return { jobId: job.id };
    } catch {
      // Mirrors `POST /repos/:id/resync`'s always-202 shape — degrade
      // rather than error when enqueue itself fails (no handler / DB hiccup).
      return { degraded: true, reason: 'no_handler' };
    }
  }

  /** Register the job handler once at plugin load (routes.ts calls this),
   *  mirroring `repo-intel/routes.ts:29`'s pattern. */
  registerGenerateJobHandler(): void {
    this.container.jobs.register(GENERATE_JOB_KIND, async (payload, ctx) => {
      const p = payload as { repoId: string; workspaceId: string };
      await this.generate(p.repoId, p.workspaceId, ctx.jobId);
    });
  }

  // -------------------------------------------------------------------------
  // Generation — the job body. S-AC-16's hard guarantee (step 7c): a
  // TOTAL-SWALLOW outer handler (never throws, under any circumstance —
  // including its own persist write) wrapping a job-scoped idempotency
  // check, so `withRetry` never re-fires a completed generation and a
  // transient failure on the trailing bookkeeping write can't trigger a
  // second `completeStructured` call.
  // -------------------------------------------------------------------------

  private async generate(repoId: string, workspaceId: string, jobId: string): Promise<void> {
    try {
      await this.doGenerate(repoId, workspaceId, jobId);
    } catch (err) {
      // Never throw out of this handler — a throw here would hit
      // `withRetry` (platform/jobs.ts), which could re-invoke the whole
      // handler including a second model call.
      console.error(`[onboarding] job=${jobId} repo=${repoId} generation failed unexpectedly`, err);
    }
  }

  private async doGenerate(repoId: string, workspaceId: string, jobId: string): Promise<void> {
    const startedAt = Date.now();

    // Job-scoped idempotency: if THIS job already completed on a prior
    // attempt (the bookkeeping write after persist raced and triggered a
    // retry), don't call the model again — just return.
    const existingJson = await this.repo.getTourJson(repoId);
    const existingTour = existingJson ? parseTourJson(existingJson) : null;
    if (existingTour?.generated_by_job_id === jobId) return;

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return; // nothing to do — enqueue already refuses this case
    const clonePath = repo.clonePath;

    // --- Step 5: index-state facts (I/O: repoIntel facade) ---
    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const filesIndexed = indexState.filesIndexed;
    const filesDiscovered = indexState.filesIndexed + indexState.filesSkipped;
    const degradation = deriveIndexDegradation({
      repoIntelEnabled: this.container.config.repoIntelEnabled,
      status: indexState.status,
      degradedReason: indexState.degradedReason,
      filesIndexed,
      maxIndexedFiles: MAX_INDEXED_FILES,
    });

    // --- Step 3: reading path + critical paths (I/O: repoIntel facade) ---
    const topFiles = await this.container.repoIntel.getTopFilesByRank(repoId, READING_PATH_SIZE);
    const rawChains = await this.container.repoIntel.getCriticalPaths(repoId);
    // getCriticalPaths does NOT apply the junk-path filter itself (only
    // getTopFilesByRank does) — post-apply it, dropping the WHOLE chain
    // when any node is junk (never splicing a middle node out).
    const chains = filterJunkChains(rawChains);

    // --- Step 4: local-run facts (I/O: node:fs on the clone) ---
    const packageJsonContent = await this.readClone(clonePath, 'package.json');
    const composeContent = await this.readFirstClone(clonePath, [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
    ]);
    const envExampleContent = await this.readClone(clonePath, '.env.example');
    const runCommands = buildRunCommands(
      { packageJsonContent, composeContent, envExampleContent },
      MAX_RUN_COMMANDS,
    );
    const envKeys = envExampleContent ? parseEnvExampleKeys(envExampleContent) : [];

    // --- Provenance ---
    const currentSha = await this.safeCurrentHead(repo);
    const { blob_ref, blob_ref_kind } = resolveBlobRef(currentSha, repo.defaultBranch);

    // --- Step 7: the single structured LLM call ---
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const readingPathBase = topFiles.map((path, i) => ({ position: i + 1, path }));
    const allowedPaths = new Set<string>([...topFiles, ...chains.flat()]);

    let structured: StructuredResult<OnboardingModelResponseT> | null = null;
    let modelFailureReason: OnboardingModelFailureReason | null = null;
    try {
      const llm = await this.container.llm(provider);
      structured = await withTimeout(
        llm.completeStructured({
          model,
          schema: OnboardingModelResponse,
          schemaName: ONBOARDING_SCHEMA_NAME,
          messages: [
            { role: 'system', content: ONBOARDING_SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildUserMessage({
                readingPath: readingPathBase,
                criticalPaths: chains,
                runCommands,
                envKeys: envKeys.slice(0, MAX_ENV_KEYS_IN_PROMPT),
                indexStatus: degradation.status,
              }),
            },
          ],
        }),
        GENERATION_DEADLINE_MS,
      );
    } catch (err) {
      // safeParse-equivalent defensive handling (step 7a) — any failure
      // here (transport, timeout, exhausted-retry validation failure inside
      // the provider) routes to the AC-24 skeleton, never throws onward.
      modelFailureReason = err instanceof TimeoutError ? 'timeout' : 'call_failed';
    }

    let modelData: OnboardingModelResponseT | null = null;
    if (structured) {
      const parsed = OnboardingModelResponse.safeParse(structured.data);
      if (parsed.success) modelData = parsed.data;
      else modelFailureReason = 'invalid_response';
    }

    let readingPath: OnboardingReadingPathEntry[];
    let criticalPaths: OnboardingCriticalPathEntry[];
    let architectureMd: string | null = null;
    let criticalPathsMd: string | null = null;
    let runLocallyMd: string | null = null;
    let readingPathMd: string | null = null;
    let firstTasksMd: string | null = null;
    let diagramSource: string | null = null;

    if (modelData) {
      readingPath = zipReadingPathRationales(readingPathBase, modelData.reading_path_rationales);
      criticalPaths = zipCriticalPathReasons(chains, modelData.critical_path_reasons);

      const scan = scanProseFieldsForHallucinatedPaths(
        {
          architecture_md: modelData.architecture_md,
          critical_paths_md: modelData.critical_paths_md,
          run_locally_md: modelData.run_locally_md,
          reading_path_md: modelData.reading_path_md,
          first_tasks_md: modelData.first_tasks_md,
        },
        allowedPaths,
      );
      architectureMd = scan.sanitized.architecture_md;
      criticalPathsMd = scan.sanitized.critical_paths_md;
      runLocallyMd = scan.sanitized.run_locally_md;
      readingPathMd = scan.sanitized.reading_path_md;
      firstTasksMd = scan.sanitized.first_tasks_md;
      // diagram_source is EXEMPT from the S-AC-19 scan — its node labels are
      // conceptual, never wired to a file-open action (see prompts.ts / the
      // spec's own design decision).
      diagramSource = modelData.diagram_source;

      if (scan.strippedCount > 0 || scan.detectedCount > 0) {
        console.warn(
          `[onboarding] repo=${repoId} job=${jobId} S-AC-19 prose scan — stripped ${scan.strippedCount} ` +
            `inline-code path occurrence(s), detected ${scan.detectedCount} plain-text occurrence(s) ` +
            `outside the deterministic fact set`,
        );
      }
    } else {
      // AC-24 skeleton — every deterministic fact, all prose absent.
      readingPath = readingPathBase.map((e) => ({ ...e, rationale: null }));
      criticalPaths = chains.map((chain) => ({ chain: [...chain], reason: null }));
    }

    // Deterministic diagram fallback (S-AC-20) — always present, built from
    // the same deterministic facts already collected above, never a fresh
    // graph query.
    const diagramFallback = buildDiagramFallback(topFiles, chains);

    const tour: OnboardingTour = {
      index_status: degradation.status,
      index_degraded_reason: degradation.reason,
      model_failure_reason: modelFailureReason,
      files_indexed: filesIndexed,
      files_discovered: filesDiscovered,
      generated_at: new Date().toISOString(),
      generated_by_job_id: jobId,
      blob_ref,
      blob_ref_kind,
      schema_version: ONBOARDING_SCHEMA_VERSION,
      tokens_in: structured?.tokensIn ?? null,
      tokens_out: structured?.tokensOut ?? null,
      cost_usd: structured?.costUsd ?? null,
      provider: structured ? provider : null,
      model: structured ? model : null,
      reading_path: readingPath,
      critical_paths: criticalPaths,
      run_commands: runCommands,
      env_keys: envKeys,
      diagram_nodes: diagramFallback.nodes,
      diagram_edges: diagramFallback.edges,
      architecture_md: architectureMd,
      critical_paths_md: criticalPathsMd,
      run_locally_md: runLocallyMd,
      reading_path_md: readingPathMd,
      first_tasks_md: firstTasksMd,
      diagram_source: diagramSource,
    };

    // Step 7d — deadline guard, checked IMMEDIATELY BEFORE the persist
    // write (never before starting the call). `withTimeout` is
    // Promise.race-only (no cancellation) and `completeStructured` accepts
    // no AbortSignal, so a late-returning call could otherwise still write
    // and clobber a good tour after the runner's own 120s timeout already
    // fired. Over budget → skip the write entirely, leaving the previous
    // tour untouched (S-AC-7). The abandoned model call (if any) still runs
    // to completion server-side and is still billed — a known, accepted
    // residual cost; no cancellation exists in this codebase's LLM port.
    if (Date.now() - startedAt > GENERATION_DEADLINE_MS) return;

    await this.repo.upsertTour(repoId, tour);
  }

  // -------------------------------------------------------------------------
  // Small I/O helpers — kept in the service layer (onion rule).
  // -------------------------------------------------------------------------

  private async readClone(clonePath: string, relPath: string): Promise<string | null> {
    try {
      const full = join(clonePath, relPath);
      const stats = await stat(full);
      if (!stats.isFile() || stats.size > MAX_LOCAL_RUN_FILE_BYTES) return null;
      return await readFile(full, 'utf8');
    } catch {
      return null;
    }
  }

  private async readFirstClone(clonePath: string, relPaths: string[]): Promise<string | null> {
    for (const relPath of relPaths) {
      const content = await this.readClone(clonePath, relPath);
      if (content != null) return content;
    }
    return null;
  }

  private async safeCurrentHead(repo: OnboardingRepoBasics): Promise<string | null> {
    try {
      const sha = await this.container.git.currentHead({ owner: repo.owner, name: repo.name });
      return sha || null;
    } catch {
      return null;
    }
  }
}

/** Compose the delimited, clearly-untrusted user message for the single
 *  generation call — every repo-derived section goes through `wrapUntrusted`
 *  (re-exported from `platform/prompt.ts`), the same mechanism every other
 *  untrusted prompt input in this codebase uses. */
function buildUserMessage(input: {
  readingPath: { position: number; path: string }[];
  criticalPaths: string[][];
  runCommands: OnboardingRunCommand[];
  envKeys: string[];
  indexStatus: OnboardingIndexStatus;
}): string {
  const readingPathText =
    input.readingPath.length > 0
      ? input.readingPath.map((e) => `${e.position}. ${e.path}`).join('\n')
      : '(none — no ranked files available)';

  const criticalPathsText =
    input.criticalPaths.length > 0
      ? input.criticalPaths.map((c) => formatChain(c)).join('\n')
      : '(none found)';

  const runCommandsText =
    input.runCommands.length > 0
      ? input.runCommands.map((c) => `${c.order}. ${c.command} (source: ${c.source})`).join('\n')
      : '(none found)';

  const envKeysText = input.envKeys.length > 0 ? input.envKeys.join('\n') : '(none)';

  return [
    `## Index coverage\n${wrapUntrusted('index-status', input.indexStatus)}`,
    `## Guided reading path (ordered by import-graph rank, already computed — do not reorder)\n${wrapUntrusted('reading-path', readingPathText)}`,
    `## Critical dependency chains (already computed)\n${wrapUntrusted('critical-paths', criticalPathsText)}`,
    `## Local run commands (already derived from the repo's own files)\n${wrapUntrusted('run-commands', runCommandsText)}`,
    `## Declared environment-variable keys (.env.example)\n${wrapUntrusted('env-keys', envKeysText)}`,
  ].join('\n\n');
}
