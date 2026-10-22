import type { CiResultArtifact, CiSyncResult, RunTrace } from '@devdigest/shared';
import { buildRunTrace, emptyPromptAssembly } from '../../../platform/trace-builder.js';
import type { CiRepository, InstallationWithContext } from '../repository.js';

/** What one sync pass hands to every run source. */
export interface SyncContext {
  workspaceId: string;
  repo: CiRepository;
  result: CiSyncResult;
  /** True when any string contains one of the server's real secret values (S-AC-37/85). */
  containsStoredSecret(strings: string[]): Promise<boolean>;
}

/**
 * Pulls finished runs of one CI target into `ci_runs` (Ring 1: ports +
 * `CiRepository` only). One instance per sync pass, so per-repo listings can
 * be cached across the installations that share a repo.
 */
export interface CiRunSource {
  syncInstallation(inst: InstallationWithContext): Promise<void>;
}

/** The trace stored for an ingested CI run (CI artifacts carry no prompt/tool data). */
export function ciRunTrace(artifact: CiResultArtifact, prNumber: number, repo: string): RunTrace {
  return buildRunTrace({
    config: {
      agent: artifact.agent,
      version: String(artifact.manifest_version),
      provider: 'openrouter',
      model: artifact.model,
      pr: prNumber,
      source: 'ci',
      commit_sha: artifact.commit_sha,
      manifest_version: artifact.manifest_version,
      repo,
      dependencies: artifact.dependencies,
    },
    stats: {
      duration_ms: artifact.duration_ms ?? 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: artifact.cost_usd,
      findings: artifact.findings_count,
      grounding: '',
    },
    promptAssembly: emptyPromptAssembly('', ''),
    toolCalls: [],
    rawOutput: '',
    memoryPulled: [],
    specsRead: [],
    log: [],
  });
}
