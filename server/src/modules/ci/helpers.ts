import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { AgentManifest, CiResultArtifact } from '@devdigest/shared';
import type { CiLintViolation, CiRunnerMeta, CiTrigger, CiPostAs, WorkflowRunInfo } from '@devdigest/shared';
import type { AgentRow } from '../../db/rows.js';
import {
  ALLOWED_PERMISSIONS,
  ARTIFACT_MAX_BYTES,
  MANIFEST_VERSION,
  PINNED_ACTIONS,
  SECRET_PATTERNS,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
  CHECKOUT_BASE_REF,
  FORK_GUARD_IF,
  RUNNER_MISSING_IF,
  RUNNER_PRESENT_IF,
  artifactName,
  jobId,
  jobName,
} from './constants.js';

/**
 * Pure helpers for the ci module — slugging, the generated file set, workflow
 * generation + lint, runner metadata, and artifact verification. No I/O, no
 * Drizzle, no Fastify: the service does the GitHub/DB calls, and everything
 * here stays unit-testable without a mocked adapter.
 */

/** Filesystem/branch-safe slug for an agent name, e.g. "Security Reviewer"
 *  → "security-reviewer". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  );
}

/**
 * The stable per-installation agent slug. An existing installation keeps its
 * stored slug; a new one gets the slugified name, suffixed with the first 6
 * characters of the agent id only when that slug is already taken by a
 * DIFFERENT agent installed on the same repo.
 */
export function resolveAgentSlug(input: {
  agentId: string;
  agentName: string;
  existingSlug: string | null | undefined;
  peers: { agentId: string; slug: string }[];
}): string {
  if (input.existingSlug) return input.existingSlug;
  const base = slugify(input.agentName);
  const taken = input.peers.some((p) => p.agentId !== input.agentId && p.slug === base);
  if (!taken) return base;
  return `${base}-${input.agentId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
}

// ---------------------------------------------------------------------------
// Model mapping + manifest + skill files
// ---------------------------------------------------------------------------

export interface MappedModel {
  provider: 'openrouter';
  model: string;
  /** Present when the agent's own provider is not OpenRouter (S-AC-6). */
  warning?: string;
}

/** The CI runner only talks to OpenRouter; other providers are namespaced. */
export function mapModel(provider: string, model: string): MappedModel {
  if (provider === 'openrouter') return { provider: 'openrouter', model };
  const mapped = `${provider}/${model}`;
  return {
    provider: 'openrouter',
    model: mapped,
    warning: `CI runs through OpenRouter only: "${model}" (${provider}) will be sent as "${mapped}" via OpenRouter.`,
  };
}

/**
 * The agent manifest the runner reads. Serialized with `yaml`, then parsed back
 * through the SAME `AgentManifest` schema the runner uses — a mismatch means
 * the generator and the runner contract drifted, so it throws instead of
 * shipping a manifest the runner would reject. Holds no secrets (S-AC-7).
 */
export function buildManifestYaml(
  agent: Pick<AgentRow, 'name' | 'provider' | 'model' | 'systemPrompt' | 'strategy' | 'ciFailOn'>,
  agentSlug: string,
  skillSlugs: string[],
  opts: { post_as: CiPostAs },
): string {
  const mapped = mapModel(agent.provider, agent.model);
  const candidate = {
    manifest_version: MANIFEST_VERSION,
    slug: agentSlug,
    name: agent.name,
    provider: mapped.provider,
    model: mapped.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    post_as: opts.post_as,
  };
  const text = stringifyYaml(candidate, { lineWidth: 0 });
  const parsed = AgentManifest.safeParse(parseYaml(text));
  if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(candidate)) {
    throw new Error('Generated agent manifest does not round-trip through AgentManifest');
  }
  return text;
}

export interface SkillFile {
  slug: string;
  path: string;
  contents: string;
}

/**
 * One file per skill, with collision-safe slugs ("a-skill", "a-skill-2").
 * Callers pass only enabled, non-scan-blocked skills.
 */
export function buildSkillFiles(skills: { name: string; body: string }[]): SkillFile[] {
  const used = new Set<string>();
  return skills.map((s) => {
    const base = slugify(s.name);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return { slug, path: `.devdigest/skills/${slug}.md`, contents: s.body };
  });
}

/** No memory store yet (S-AC-5). */
export function buildMemoryJsonl(): string {
  return '';
}

// ---------------------------------------------------------------------------
// Workflow generation
// ---------------------------------------------------------------------------

export interface WorkflowAgent {
  slug: string;
}

/**
 * The GitHub Actions workflow: one job per agent installed in the repo.
 * Hardening (S-AC-8..18): `pull_request` only, least-privilege `permissions`,
 * SHA-pinned actions, base-SHA checkout with no persisted credentials, fork PRs
 * skipped, and every context value passed through `env:` — never inside `run:`.
 */
export function buildWorkflowYaml(input: { agents: WorkflowAgent[]; triggers: CiTrigger[] }): string {
  const jobs: Record<string, unknown> = {};
  for (const agent of input.agents) {
    jobs[jobId(agent.slug)] = {
      name: jobName(agent.slug),
      'runs-on': 'ubuntu-latest',
      'timeout-minutes': 15,
      if: FORK_GUARD_IF,
      steps: [
        {
          uses: PINNED_ACTIONS.checkout,
          with: {
            ref: CHECKOUT_BASE_REF,
            'persist-credentials': false,
          },
        },
        { uses: PINNED_ACTIONS.setupNode, with: { 'node-version': 20 } },
        {
          // The export PR's own base checkout has no runner yet — skip, don't fail.
          name: 'Runner not installed yet',
          if: RUNNER_MISSING_IF,
          run: 'echo "::notice::.devdigest/runner.mjs is not on the base branch yet; merge the DevDigest CI PR to enable reviews."',
        },
        {
          name: 'Run DevDigest review',
          if: RUNNER_PRESENT_IF,
          run: 'node .devdigest/runner.mjs',
          env: {
            DEVDIGEST_AGENT: agent.slug,
            PR_NUMBER: '${{ github.event.pull_request.number }}',
            GITHUB_TOKEN: '${{ github.token }}',
            OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
          },
        },
        {
          if: 'always()',
          uses: PINNED_ACTIONS.uploadArtifact,
          with: {
            name: artifactName(agent.slug),
            path: 'devdigest-result.json',
            'if-no-files-found': 'ignore',
            'retention-days': 14,
          },
        },
      ],
    };
  }

  const doc = {
    name: 'DevDigest Review',
    on: { pull_request: { types: input.triggers } },
    permissions: { ...ALLOWED_PERMISSIONS },
    concurrency: {
      group: 'devdigest-${{ github.event.pull_request.number }}',
      'cancel-in-progress': true,
    },
    jobs,
  };
  return `# devdigest-workflow-version: ${WORKFLOW_VERSION}\n${stringifyYaml(doc, { lineWidth: 0 })}`;
}

// ---------------------------------------------------------------------------
// Workflow lint (S-AC-19) — the workflow text is parsed as data, never evaluated
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function lintPermissions(value: unknown, location: string, out: CiLintViolation[]): void {
  if (!isRecord(value)) {
    out.push({
      rule: 'permissions.too_broad',
      location,
      message: `${location} must list explicit permissions, not "${String(value)}".`,
    });
    return;
  }
  for (const [key, level] of Object.entries(value)) {
    const allowed = ALLOWED_PERMISSIONS[key];
    if (allowed === undefined || (level !== allowed && level !== 'none')) {
      out.push({
        rule: 'permissions.too_broad',
        location: `${location}.${key}`,
        message: `Permission "${key}: ${String(level)}" is not allowed; only contents: read and pull-requests: write.`,
      });
    }
  }
}

const TOP_KEYS = new Set(['name', 'run-name', 'on', 'permissions', 'concurrency', 'env', 'defaults', 'jobs']);
const JOB_KEYS = new Set([
  'name',
  'runs-on',
  'timeout-minutes',
  'if',
  'steps',
  'permissions',
  'needs',
  'env',
  'defaults',
  'concurrency',
  'container',
  'services',
  'continue-on-error',
]);
const STEP_KEYS = new Set([
  'name',
  'id',
  'if',
  'uses',
  'with',
  'run',
  'shell',
  'env',
  'working-directory',
  'continue-on-error',
  'timeout-minutes',
]);
const PR_EVENT_KEYS = new Set(['types', 'branches', 'branches-ignore', 'paths', 'paths-ignore']);
const CONTAINER_KEYS = new Set(['image', 'env']);
/** Env names that change how a process loads code; never settable from an expression. */
const DANGEROUS_ENV = new Set(['node_options', 'ld_preload', 'ld_library_path', 'bash_env', 'env', 'path']);
const USES_RE = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const IMAGE_DIGEST_RE = /@sha256:[0-9a-f]{64}$/;

/** True when an expression body reads attacker-controllable event context. */
function isUntrustedExpression(expr: string): boolean {
  const norm = expr
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\[['"]([^'"]+)['"]\]/g, '.$1');
  return (
    /github\.(event|head_ref)\b/.test(norm) ||
    /(^|[^\w.-])inputs([.[]|$)/.test(norm) ||
    /tojson\(github\)/.test(norm) ||
    /github\.\*/.test(norm)
  );
}

/** True when any `${{ }}` inside the string reads untrusted context. */
function hasUntrustedExpression(text: string): boolean {
  for (const m of text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    if (isUntrustedExpression(m[1] ?? '')) return true;
  }
  return false;
}

function scanUntrusted(value: unknown, location: string, out: CiLintViolation[]): void {
  if (typeof value === 'string') {
    if (hasUntrustedExpression(value)) {
      out.push({
        rule: 'expression.untrusted_context',
        location,
        message:
          'github.event.*, github.head_ref and inputs.* may only be used in env: values (and the pinned checkout ref); pass them through env: instead.',
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanUntrusted(v, `${location}[${i}]`, out));
  } else if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) scanUntrusted(v, `${location}.${k}`, out);
  }
}

function lintKeys(obj: Record<string, unknown>, allowed: Set<string>, location: string, out: CiLintViolation[]): void {
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) continue;
    const caseVariant = [...allowed].some((a) => a.toLowerCase() === key.toLowerCase());
    out.push({
      rule: 'key.unknown',
      location: `${location}.${key}`,
      message: caseVariant
        ? `"${key}" is a case variant of a known key; use the exact lowercase spelling.`
        : `"${key}" is not an allowed key here.`,
    });
  }
}

function lintEvents(on: unknown, out: CiLintViolation[]): void {
  const bad = (name: string): void => {
    out.push({
      rule: name === 'pull_request_target' ? 'event.pull_request_target' : 'event.not_allowed',
      location: 'on',
      message:
        name === 'pull_request_target'
          ? 'pull_request_target runs with secrets on untrusted code and is not allowed.'
          : `Only the pull_request event is allowed, not "${name}".`,
    });
  };
  if (typeof on === 'string') {
    if (on !== 'pull_request') bad(on);
  } else if (Array.isArray(on)) {
    if (on.length === 0) bad('(none)');
    for (const e of on) if (e !== 'pull_request') bad(String(e));
  } else if (isRecord(on)) {
    const names = Object.keys(on);
    if (names.length === 0) bad('(none)');
    for (const n of names) if (n !== 'pull_request') bad(n);
    if (isRecord(on.pull_request)) lintKeys(on.pull_request, PR_EVENT_KEYS, 'on.pull_request', out);
  } else {
    out.push({ rule: 'event.missing', location: 'on', message: 'Add on: pull_request.' });
  }
}

function lintContainer(value: unknown, location: string, out: CiLintViolation[]): void {
  const image = typeof value === 'string' ? value : isRecord(value) ? value.image : undefined;
  if (isRecord(value)) lintKeys(value, CONTAINER_KEYS, location, out);
  if (typeof image !== 'string' || !IMAGE_DIGEST_RE.test(image)) {
    out.push({
      rule: 'image.not_pinned',
      location,
      message: 'Container and service images must be pinned by an @sha256:<64 hex> digest.',
    });
  }
}

function lintEnv(env: unknown, location: string, out: CiLintViolation[]): void {
  if (!isRecord(env)) return;
  for (const [k, v] of Object.entries(env)) {
    if (DANGEROUS_ENV.has(k.toLowerCase()) && typeof v === 'string' && v.includes('${{')) {
      out.push({
        rule: 'env.dangerous_name',
        location: `${location}.${k}`,
        message: `${k} must not be set from an expression.`,
      });
    }
  }
}

function lintStep(step: unknown, loc: string, out: CiLintViolation[]): void {
  if (!isRecord(step)) return;
  lintKeys(step, STEP_KEYS, loc, out);
  const uses = step.uses;
  let isCheckout = false;
  if (uses !== undefined) {
    if (typeof uses !== 'string' || !USES_RE.test(uses)) {
      out.push({
        rule: 'uses.not_pinned',
        location: loc,
        message: `"${String(uses)}" must be "owner/repo[/path]@<40-character commit SHA>"; local (./) and docker:// actions are not allowed.`,
      });
    } else {
      isCheckout = /^actions\/checkout(\/|@)/i.test(uses);
    }
  }
  if (isCheckout) {
    const w = isRecord(step.with) ? step.with : {};
    if (w.ref !== CHECKOUT_BASE_REF) {
      out.push({
        rule: 'checkout.ref',
        location: `${loc}.with.ref`,
        message: `actions/checkout must check out ref: ${CHECKOUT_BASE_REF}.`,
      });
    }
    if (w['persist-credentials'] !== false) {
      out.push({
        rule: 'checkout.persist_credentials',
        location: `${loc}.with.persist-credentials`,
        message: 'actions/checkout must set persist-credentials: false.',
      });
    }
  }
  if (typeof step.run === 'string' && step.run.includes('${{')) {
    out.push({
      rule: 'run.untrusted_expression',
      location: loc,
      message: 'A run: value must not contain ${{ }} expressions; pass values through env: instead.',
    });
  }
  lintEnv(step.env, `${loc}.env`, out);
  // Everything except env: (and the already-validated checkout ref) is scanned.
  const { env: _env, ...rest } = step;
  void _env;
  if (isCheckout && isRecord(rest.with)) {
    const { ref: _ref, ...withRest } = rest.with;
    void _ref;
    rest.with = withRest;
  }
  scanUntrusted(rest, loc, out);
  // A bare `if:` expression has no ${{ }} wrapper; scan it as an expression.
  if (typeof step.if === 'string' && isUntrustedExpression(step.if)) {
    out.push({
      rule: 'expression.untrusted_context',
      location: `${loc}.if`,
      message: 'A step if: must not read github.event.*, github.head_ref or inputs.*.',
    });
  }
}

/** Returns every blocking violation; an empty array means the workflow is acceptable. */
export function lintWorkflow(text: string): CiLintViolation[] {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    return [
      {
        rule: 'yaml.parse_error',
        location: 'document',
        message: `The workflow is not valid YAML: ${(err as Error).message.split('\n')[0]}`,
      },
    ];
  }
  if (!isRecord(doc)) {
    return [{ rule: 'yaml.parse_error', location: 'document', message: 'The workflow must be a YAML mapping.' }];
  }

  const out: CiLintViolation[] = [];
  lintKeys(doc, TOP_KEYS, 'document', out);

  if (doc.permissions === undefined || doc.permissions === null) {
    out.push({
      rule: 'permissions.missing',
      location: 'permissions',
      message: 'Add a top-level permissions block (contents: read, pull-requests: write).',
    });
  } else {
    lintPermissions(doc.permissions, 'permissions', out);
  }

  lintEvents(doc.on, out);
  if (doc.defaults !== undefined) scanUntrusted(doc.defaults, 'defaults', out);
  lintEnv(doc.env, 'env', out);

  const jobs = isRecord(doc.jobs) ? doc.jobs : {};
  for (const [id, job] of Object.entries(jobs)) {
    const jobLoc = `jobs.${id}`;
    if (!isRecord(job)) {
      out.push({ rule: 'job.invalid', location: jobLoc, message: 'A job must be a mapping.' });
      continue;
    }
    lintKeys(job, JOB_KEYS, jobLoc, out);
    if (job.permissions !== undefined) lintPermissions(job.permissions, `${jobLoc}.permissions`, out);
    if (typeof job.if !== 'string' || job.if.trim() !== FORK_GUARD_IF) {
      out.push({
        rule: 'job.fork_guard',
        location: `${jobLoc}.if`,
        message: `Every job must have if: ${FORK_GUARD_IF} so fork PRs are skipped.`,
      });
    }
    if (job.container !== undefined) lintContainer(job.container, `${jobLoc}.container`, out);
    if (isRecord(job.services)) {
      for (const [name, svc] of Object.entries(job.services)) lintContainer(svc, `${jobLoc}.services.${name}`, out);
    } else if (job.services !== undefined) {
      out.push({ rule: 'job.invalid', location: `${jobLoc}.services`, message: 'services must be a mapping.' });
    }
    if (job.defaults !== undefined) scanUntrusted(job.defaults, `${jobLoc}.defaults`, out);
    lintEnv(job.env, `${jobLoc}.env`, out);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step, i) => lintStep(step, `${jobLoc}.steps[${i}]`, out));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runner metadata, PR body, zip
// ---------------------------------------------------------------------------

/** Size, banner version and SHA-256 of the bundled runner (S-AC-2, S-AC-27). */
export function runnerMetadata(bytes: Uint8Array): CiRunnerMeta {
  const head = strFromU8(bytes.subarray(0, 200));
  const match = /^\/\/ devdigest-runner (\S+)/.exec(head);
  return {
    size_bytes: bytes.byteLength,
    runner_version: match?.[1] ?? 'unknown',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function buildPrBody(input: { agents: { name: string; slug: string }[]; runnerMeta: CiRunnerMeta }): string {
  const agentLines = input.agents.map((a) => `- **${a.name}** (\`${a.slug}\`)`).join('\n');
  return [
    'Adds DevDigest AI code review to this repository. It runs on every pull request via GitHub Actions.',
    '',
    '### Agents',
    agentLines,
    '',
    '### Before merging',
    '- [ ] Add the repository secret `OPENROUTER_API_KEY` (Settings -> Secrets and variables -> Actions).',
    `- [ ] Review \`${WORKFLOW_PATH}\`: it uses least-privilege permissions, SHA-pinned actions, checks out the base commit and skips fork PRs.`,
    '',
    '### Protect the workflow',
    `Anyone who can edit \`${WORKFLOW_PATH}\` in a pull request can change how it runs. Add it to CODEOWNERS and require review from the owners with branch protection. To block merges on findings, mark the check as required.`,
    '',
    '### Runner',
    `- Version: \`${input.runnerMeta.runner_version}\``,
    `- SHA-256: \`${input.runnerMeta.sha256}\``,
    `- Size: ${input.runnerMeta.size_bytes} bytes`,
    '',
    '### Token scopes used to create this PR',
    'Classic PAT: `repo` + `workflow`. Fine-grained PAT: Contents, Pull requests and Workflows (write); Actions (read) for syncing results.',
  ].join('\n');
}

/** Pack `{path, bytes}` entries into a zip (the "Download zip" option). */
export function zipFiles(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = f.data;
  return zipSync(entries);
}

export { strToU8 };

// ---------------------------------------------------------------------------
// Artifact ingest helpers
// ---------------------------------------------------------------------------

export class ArtifactExtractError extends Error {
  constructor(
    public readonly code: 'artifact_too_large' | 'artifact_missing' | 'artifact_invalid',
    message: string,
  ) {
    super(message);
    this.name = 'ArtifactExtractError';
  }
}

const RESULT_FILE = 'devdigest-result.json';

/**
 * Unzip an artifact and return the text of `devdigest-result.json`. The archive
 * must hold exactly that one entry, and both the declared per-entry size and
 * the total are capped at `ARTIFACT_MAX_BYTES` before anything is inflated.
 */
export function extractResultFromZip(bytes: Uint8Array): string {
  const names: string[] = [];
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        total += f.originalSize;
        if (f.originalSize > ARTIFACT_MAX_BYTES || total > ARTIFACT_MAX_BYTES) {
          throw new ArtifactExtractError('artifact_too_large', 'Artifact exceeds the size cap');
        }
        return f.name === RESULT_FILE;
      },
    });
  } catch (err) {
    if (err instanceof ArtifactExtractError) throw err;
    throw new ArtifactExtractError('artifact_invalid', 'Artifact is not a valid zip archive');
  }
  if (names.length !== 1 || names[0] !== RESULT_FILE || !files[RESULT_FILE]) {
    throw new ArtifactExtractError('artifact_missing', `Artifact must contain exactly ${RESULT_FILE}`);
  }
  return strFromU8(files[RESULT_FILE]);
}

/** True when the text contains a known token prefix (S-AC-37). */
export function scanForSecrets(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Every string (keys and values) in a parsed JSON value, so escaped secrets are caught after decoding. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectStrings(v, out);
    }
  }
  return out;
}

export type ArtifactCheck =
  | 'schema'
  | 'commit_sha'
  | 'repository_id'
  | 'repository'
  | 'pull_request'
  | 'workflow_path'
  | 'agent_slug';

export type VerifyResult =
  | { ok: true; artifact: CiResultArtifact }
  | { ok: false; check: ArtifactCheck };

/**
 * Cross-check an untrusted artifact against GitHub's own run metadata, in the
 * S-AC-35 order. The ingest trusts the API's `head_sha` / `repository.id` /
 * `pull_requests` / workflow path, never the artifact's claims.
 */
export function verifyArtifact(
  raw: unknown,
  run: Pick<WorkflowRunInfo, 'id' | 'runAttempt' | 'headSha' | 'repositoryId' | 'path' | 'pullRequests'>,
  installation: { githubRepoId: number | null; agentSlug: string; repo: string },
): VerifyResult {
  const parsed = CiResultArtifact.safeParse(raw);
  if (!parsed.success) return { ok: false, check: 'schema' };
  const a = parsed.data;
  if (
    a.findings_count !== (a.critical ?? 0) + (a.warning ?? 0) + (a.suggestion ?? 0) ||
    a.run_id !== run.id ||
    a.run_attempt !== run.runAttempt
  ) {
    return { ok: false, check: 'schema' };
  }
  if (a.repository.toLowerCase() !== installation.repo.toLowerCase()) return { ok: false, check: 'repository' };
  if (a.commit_sha !== run.headSha) return { ok: false, check: 'commit_sha' };
  if (
    installation.githubRepoId === null ||
    a.repository_id !== installation.githubRepoId ||
    a.repository_id !== run.repositoryId
  ) {
    return { ok: false, check: 'repository_id' };
  }
  if (a.pr_number == null || !run.pullRequests.some((p) => p.number === a.pr_number)) {
    return { ok: false, check: 'pull_request' };
  }
  if (run.path.split('@')[0] !== WORKFLOW_PATH) return { ok: false, check: 'workflow_path' };
  if (a.agent_slug !== installation.agentSlug) return { ok: false, check: 'agent_slug' };
  return { ok: true, artifact: a };
}
