import type { Finding, Verdict } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact and in the bundle banner. */
export const RUNNER_VERSION = '2';

/** Schema version of `devdigest-result.json` (bumped on breaking changes). */
export const ARTIFACT_SCHEMA_VERSION = 1;

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  /** Manifest display name. */
  agent: string;
  /** Manifest slug (the studio checks it against the installation). */
  agentSlug: string;
  prNumber: number;
  /** `owner/name` of the repository the workflow runs in. */
  repository: string;
  repositoryId: number;
  commitSha: string;
  runId: number;
  runAttempt: number;
  /** Deterministic verdict from the gate payload — never the model's own. */
  verdict: Verdict;
  blockers: number;
  gateTriggered: boolean;
  model: string;
  manifestVersion: number;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/** Map the GitHub review event the deterministic gate produced onto `Verdict`. */
export function verdictFromEvent(event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Verdict {
  if (event === 'REQUEST_CHANGES') return 'request_changes';
  if (event === 'APPROVE') return 'approve';
  return 'comment';
}

/**
 * Build + validate the `devdigest-result.json` artifact. Validated against the
 * SAME strict `CiResultArtifact` Zod contract the studio's ingest path
 * `safeParse`s on the way back in, so a malformed artifact fails loudly here
 * rather than silently on ingest. Never includes env values (no secrets).
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    agent: input.agent,
    agent_slug: input.agentSlug,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    repository: input.repository,
    repository_id: input.repositoryId,
    commit_sha: input.commitSha,
    run_id: input.runId,
    run_attempt: input.runAttempt,
    verdict: input.verdict,
    blockers: input.blockers,
    gate_triggered: input.gateTriggered,
    model: input.model,
    manifest_version: input.manifestVersion,
    dependencies: { runner: RUNNER_VERSION, node: process.version },
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
