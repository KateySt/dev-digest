import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { RunTrace } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow, CiJenkinsConnectionRow, CiRunRow } from '../../db/rows.js';

export interface CiRunFilters {
  agentId?: string;
  repo?: string;
  status?: string;
  source?: string;
  since?: Date;
  limit: number;
  /** Rows to skip (paging). */
  offset?: number;
}

/** A run row joined with its installation's agent/repo — for the CI Runs
 *  page and the CI tab's recent history. */
export interface CiRunWithContext {
  run: CiRunRow;
  agentId: string | null;
  agentName: string | null;
  repo: string | null;
  workflowVersion: number | null;
}

/** An installation joined with its agent's name and its latest run. */
export interface InstallationWithContext {
  installation: CiInstallationRow;
  agentName: string;
  lastRunStatus: string | null;
  lastRunAt: Date | null;
}

export interface UpsertInstallationValues {
  agentId: string;
  repo: string;
  targetType: 'gha' | 'jenkins';
  githubRepoId: number;
  branch: string;
  workflowPath: string;
  workflowVersion: number;
  manifestVersion: number;
  exportedCiFailOn: string;
  postAs: string;
  triggers: string[];
  prUrl: string | null;
  agentSlug: string;
  /** Jenkins only; pass null for GitHub Actions. */
  ciServerUrl: string | null;
  ciJobName: string | null;
  openrouterCredentialId: string | null;
  githubCredentialId: string | null;
  scanCredentialId: string | null;
  agentLabel: string | null;
}

/** Repo-wide Jenkins settings shared by every Jenkins installation of a repo. */
export interface JenkinsRepoSettings {
  ciServerUrl: string | null;
  ciJobName: string;
  openrouterCredentialId: string;
  githubCredentialId: string;
  scanCredentialId: string | null;
  agentLabel: string;
}

/** Which CI a run row came from, and its identity there. */
export type RunIdentity =
  | { source: 'gha'; githubRunId: number; runAttempt: number }
  | { source: 'jenkins'; externalBuildId: string };

/** A `ci_runs` row for a run whose artifact failed verification / download. */
export interface FailedRunValues {
  ciInstallationId: string;
  identity: RunIdentity;
  ranAt: Date;
  prNumber: number | null;
  /** Null for Jenkins builds whose artifact never arrived (no trusted head SHA). */
  commitSha: string | null;
  jobUrl: string;
  ingestError: string;
  agentSlug: string;
}

export interface IngestVerifiedInput {
  workspaceId: string;
  agentId: string;
  installationId: string;
  identity: RunIdentity;
  ranAt: Date;
  jobUrl: string;
  prNumber: number;
  prTitle: string | null;
  commitSha: string;
  agentSlug: string;
  verdict: string;
  model: string;
  manifestVersion: number;
  critical: number;
  warning: number;
  suggestion: number;
  blockers: number;
  findingsCount: number;
  durationMs: number | null;
  costUsd: number | null;
  /** `agent_runs.status` and `ci_runs.status`. */
  agentRunStatus: 'done' | 'failed';
  ciStatus: 'succeeded' | 'no_findings' | 'failed';
  trace: RunTrace;
}

class DuplicateRunRollback extends Error {}

/**
 * ci data-access. Owns `ci_installations` + `ci_runs`, and the ingest
 * transaction that also writes `agent_runs` + `run_traces`. `ci_runs` has no
 * `workspaceId` of its own — every workspace-scoped query over it joins
 * through `ci_installations` -> `agents`, same join-through pattern as
 * `eval_runs`.
 */
export class CiRepository {
  constructor(private db: Db) {}

  // ---- installations ----------------------------------------------------

  /** Installations of one agent, each with its latest run's status + time. */
  async listInstallationsForAgent(agentId: string): Promise<InstallationWithContext[]> {
    return this.selectInstallations(eq(t.ciInstallations.agentId, agentId));
  }

  /** Installations of every agent (in the workspace) already set up on `repo`. */
  async listInstallationsForRepo(workspaceId: string, repo: string): Promise<InstallationWithContext[]> {
    return this.selectInstallations(
      and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)),
    );
  }

  /** Every `gha` and `jenkins` installation in the workspace — the sync work list. */
  async listInstallationsForWorkspace(workspaceId: string): Promise<InstallationWithContext[]> {
    return this.selectInstallations(
      and(
        eq(t.agents.workspaceId, workspaceId),
        inArray(t.ciInstallations.targetType, ['gha', 'jenkins']),
      ),
    );
  }

  private async selectInstallations(where: ReturnType<typeof and>): Promise<InstallationWithContext[]> {
    const lastStatus = sql<string | null>`(
      select r.status from ${t.ciRuns} r
      where r.ci_installation_id = ${t.ciInstallations.id}
      order by r.ran_at desc nulls last limit 1)`;
    const lastAt = sql<Date | null>`(
      select r.ran_at from ${t.ciRuns} r
      where r.ci_installation_id = ${t.ciInstallations.id}
      order by r.ran_at desc nulls last limit 1)`;
    const rows = await this.db
      .select({
        installation: t.ciInstallations,
        agentName: t.agents.name,
        lastRunStatus: lastStatus,
        lastRunAt: lastAt,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(where)
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map((r) => ({
      ...r,
      // raw sql timestamps arrive as strings from the driver
      lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
    }));
  }

  /** Insert or update the (agent, repo) installation; `installed_at` is kept. */
  async upsertInstallation(values: UpsertInstallationValues): Promise<CiInstallationRow> {
    const { agentId, repo, ...rest } = values;
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId, repo, ...rest })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set: rest,
      })
      .returning();
    return row!;
  }

  /** Q2: Jenkins job/credential/label settings are repo-wide — apply to every peer. */
  async updateJenkinsRepoSettings(
    workspaceId: string,
    repo: string,
    settings: JenkinsRepoSettings,
  ): Promise<void> {
    const agentIds = this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    await this.db
      .update(t.ciInstallations)
      .set(settings)
      .where(
        and(
          eq(t.ciInstallations.repo, repo),
          eq(t.ciInstallations.targetType, 'jenkins'),
          inArray(t.ciInstallations.agentId, agentIds),
        ),
      );
  }

  /** Persist (or clear, with null) an installation's last sync error code. */
  async setLastSyncError(installationId: string, code: string | null): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ lastSyncError: code })
      .where(eq(t.ciInstallations.id, installationId));
  }

  async markSynced(installationIds: string[], at: Date): Promise<void> {
    if (installationIds.length === 0) return;
    await this.db
      .update(t.ciInstallations)
      .set({ lastSyncedAt: at })
      .where(inArray(t.ciInstallations.id, installationIds));
  }

  /** Distinct repos with at least one installation in the workspace. */
  async listRepos(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ repo: t.ciInstallations.repo })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(t.ciInstallations.repo);
    return rows.map((r) => r.repo);
  }

  // ---- runs -------------------------------------------------------------

  /** Runs for the workspace's agents, newest first, optionally filtered. */
  async listRuns(workspaceId: string, filters: CiRunFilters): Promise<CiRunWithContext[]> {
    return this.selectRuns(this.runsWhere(workspaceId, filters), filters.limit, filters.offset);
  }

  /** How many runs match the filters (for paging). */
  async countRuns(workspaceId: string, filters: Omit<CiRunFilters, 'limit' | 'offset'>): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciInstallations.id, t.ciRuns.ciInstallationId))
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(this.runsWhere(workspaceId, filters));
    return row?.n ?? 0;
  }

  private runsWhere(workspaceId: string, filters: Omit<CiRunFilters, 'limit' | 'offset'>) {
    const conditions = [eq(t.agents.workspaceId, workspaceId)];
    if (filters.agentId) conditions.push(eq(t.agents.id, filters.agentId));
    if (filters.repo) conditions.push(eq(t.ciInstallations.repo, filters.repo));
    if (filters.status) conditions.push(eq(t.ciRuns.status, filters.status));
    if (filters.source) conditions.push(eq(t.ciRuns.source, filters.source));
    if (filters.since) conditions.push(gte(t.ciRuns.ranAt, filters.since));
    return and(...conditions);
  }

  async recentRunsForAgent(agentId: string, limit: number): Promise<CiRunWithContext[]> {
    return this.selectRuns(eq(t.ciInstallations.agentId, agentId), limit);
  }

  private async selectRuns(where: ReturnType<typeof and>, limit: number, offset = 0): Promise<CiRunWithContext[]> {
    return this.db
      .select({
        run: t.ciRuns,
        agentId: t.agents.id,
        agentName: t.agents.name,
        repo: t.ciInstallations.repo,
        workflowVersion: t.ciInstallations.workflowVersion,
      })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciInstallations.id, t.ciRuns.ciInstallationId))
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(where)
      // id breaks ties so pages never repeat or skip a run.
      .orderBy(desc(t.ciRuns.ranAt), desc(t.ciRuns.id))
      .limit(limit)
      .offset(offset);
  }

  // ---- ingest -----------------------------------------------------------

  /** `"<runId>:<attempt>"` keys of the given GitHub runs that are already stored. */
  async existingRunKeys(installationId: string, githubRunIds: number[]): Promise<Set<string>> {
    if (githubRunIds.length === 0) return new Set();
    const rows = await this.db
      .select({ runId: t.ciRuns.githubRunId, attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.ciInstallationId, installationId), inArray(t.ciRuns.githubRunId, githubRunIds)),
      );
    return new Set(rows.map((r) => `${r.runId}:${r.attempt}`));
  }

  /** Jenkins `external_build_id`s of the given builds that are already stored. */
  async existingExternalBuildIds(installationId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.ciRuns.externalBuildId })
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.ciInstallationId, installationId), inArray(t.ciRuns.externalBuildId, ids)));
    return new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
  }

  /**
   * Record a run whose artifact could not be ingested. Only GitHub metadata is
   * stored — never any artifact content. Returns false when the (installation,
   * run, attempt) triple already exists.
   */
  async recordFailedRun(values: FailedRunValues): Promise<boolean> {
    const rows = await this.db
      .insert(t.ciRuns)
      .values({
        ciInstallationId: values.ciInstallationId,
        ...identityColumns(values.identity),
        ranAt: values.ranAt,
        prNumber: values.prNumber,
        commitSha: values.commitSha,
        jobUrl: values.jobUrl,
        githubUrl: values.jobUrl,
        ingestError: values.ingestError,
        agentSlug: values.agentSlug,
        status: 'failed',
      })
      .onConflictDoNothing()
      .returning({ id: t.ciRuns.id });
    return rows.length > 0;
  }

  /**
   * Persist a verified run: `agent_runs` + `run_traces` + `ci_runs` in ONE
   * transaction (S-AC-40/41). If the `ci_runs` insert hits the unique key (a
   * concurrent sync won), the whole transaction rolls back so no orphan
   * `agent_runs` row survives, and `false` is returned.
   */
  async ingestVerifiedRun(input: IngestVerifiedInput): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        const [agentRun] = await tx
          .insert(t.agentRuns)
          .values({
            workspaceId: input.workspaceId,
            agentId: input.agentId,
            prId: null,
            ranAt: input.ranAt,
            provider: 'openrouter',
            model: input.model,
            durationMs: input.durationMs,
            costUsd: input.costUsd,
            status: input.agentRunStatus,
            source: 'ci',
            findingsCount: input.findingsCount,
            blockers: input.blockers,
          })
          .returning({ id: t.agentRuns.id });
        const agentRunId = agentRun!.id;

        await tx.insert(t.runTraces).values({ runId: agentRunId, trace: input.trace });

        const inserted = await tx
          .insert(t.ciRuns)
          .values({
            ciInstallationId: input.installationId,
            agentRunId,
            ...identityColumns(input.identity),
            ranAt: input.ranAt,
            prNumber: input.prNumber,
            prTitle: input.prTitle,
            commitSha: input.commitSha,
            verdict: input.verdict,
            status: input.ciStatus,
            findingsCount: input.findingsCount,
            critical: input.critical,
            warning: input.warning,
            suggestion: input.suggestion,
            blockers: input.blockers,
            durationMs: input.durationMs,
            costUsd: input.costUsd,
            model: input.model,
            manifestVersion: input.manifestVersion,
            jobUrl: input.jobUrl,
            githubUrl: input.jobUrl,
            agentSlug: input.agentSlug,
          })
          .onConflictDoNothing()
          .returning({ id: t.ciRuns.id });
        if (inserted.length === 0) throw new DuplicateRunRollback();
      });
      return true;
    } catch (err) {
      if (err instanceof DuplicateRunRollback) return false;
      throw err;
    }
  }
}

// ---- per-repo Jenkins connections ---------------------------------------

/** `ci_jenkins_connections` access (URL + username; the token is in SecretsProvider). */
export class JenkinsConnectionRepository {
  constructor(private db: Db) {}

  async get(workspaceId: string, repo: string): Promise<CiJenkinsConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(t.ciJenkinsConnections)
      .where(
        and(
          eq(t.ciJenkinsConnections.workspaceId, workspaceId),
          eq(t.ciJenkinsConnections.repo, repo.toLowerCase()),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsert(workspaceId: string, repo: string, url: string, username: string): Promise<void> {
    await this.db
      .insert(t.ciJenkinsConnections)
      .values({ workspaceId, repo: repo.toLowerCase(), url, username })
      .onConflictDoUpdate({
        target: [t.ciJenkinsConnections.workspaceId, t.ciJenkinsConnections.repo],
        set: { url, username, updatedAt: new Date() },
      });
  }

  async delete(workspaceId: string, repo: string): Promise<void> {
    await this.db
      .delete(t.ciJenkinsConnections)
      .where(
        and(
          eq(t.ciJenkinsConnections.workspaceId, workspaceId),
          eq(t.ciJenkinsConnections.repo, repo.toLowerCase()),
        ),
      );
  }

  /** Every stored connection (all workspaces) — for the stored-secret guards (S-AC-85). */
  async listAll(): Promise<Pick<CiJenkinsConnectionRow, 'workspaceId' | 'repo'>[]> {
    return this.db
      .select({ workspaceId: t.ciJenkinsConnections.workspaceId, repo: t.ciJenkinsConnections.repo })
      .from(t.ciJenkinsConnections);
  }
}

function identityColumns(identity: RunIdentity) {
  return identity.source === 'gha'
    ? {
        source: 'gha' as const,
        githubRunId: identity.githubRunId,
        runAttempt: identity.runAttempt,
        externalBuildId: null,
      }
    : {
        source: 'jenkins' as const,
        githubRunId: null,
        runAttempt: null,
        externalBuildId: identity.externalBuildId,
      };
}
