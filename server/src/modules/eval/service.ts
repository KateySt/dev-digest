import type { Container } from '../../platform/container.js';
import type { EvalCase, EvalCaseListItem, EvalCaseRun, EvalOwnerKind, EvalPerTrace, EvalRun } from '@devdigest/shared';
import type { Provider } from '@devdigest/shared';
import { reviewPullRequest, scoreEvalCase } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EvalRepository } from './repository.js';
import {
  aggregateLatestRuns,
  parseExpectedOutput,
  toEvalCaseDto,
  toEvalCaseListItem,
  toEvalCaseRunDto,
} from './helpers.js';
import { DASHBOARD_RECENT_RUNS_LIMIT, DASHBOARD_TREND_LIMIT } from './constants.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';

export interface CreateEvalCaseInput {
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

export interface UpdateEvalCaseInput {
  name?: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

/**
 * A1-adjacent — eval service. Backs the Agent Editor's Evals tab, the Eval
 * Case Editor modal, and the global Eval Dashboard.
 *
 * Only `owner_kind: 'agent'` cases can actually be RUN in this pass — the
 * Evals tab (the only place cases are created right now) always creates
 * agent-owned cases. `owner_kind: 'skill'` is accepted on create (the schema
 * allows it) but `runCase` 404s a skill-owned case's owner lookup, since a
 * "baseline agent + this skill" concept doesn't exist yet.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  async listForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalCaseListItem[]> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const latest = await this.repo.latestRunsForCases(cases.map((c) => c.id));
    return cases.map((c) => toEvalCaseListItem(c, latest.get(c.id)));
  }

  async get(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateEvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes,
    });
    return toEvalCaseDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateEvalCaseInput): Promise<EvalCase | undefined> {
    const row = await this.repo.updateCase(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  /** The Evals tab's header rollup — display only, triggers no run. */
  async statsForAgent(workspaceId: string, agentId: string) {
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const latest = await this.repo.latestRunsForCases(cases.map((c) => c.id));
    return { cases_total: cases.length, ...aggregateLatestRuns(cases.map((c) => latest.get(c.id))) };
  }

  /** Run ONE eval case against its owning agent; persists + returns the
   *  resulting `eval_runs` row. */
  async runCase(workspaceId: string, caseId: string): Promise<EvalCaseRun> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row) throw new NotFoundError('Eval case not found');
    if (row.ownerKind !== 'agent') {
      throw new ValidationError('Only agent-owned eval cases can be run in this build');
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, row.ownerId);
    if (!agent) throw new NotFoundError('Owning agent not found');

    const diff = parseUnifiedDiff(row.inputDiff ?? '');
    const linkedSkills = await this.container.agentsRepo.linkedSkills(agent.id);
    const skillBodies = linkedSkills.filter((l) => l.skill.enabled).map((l) => l.skill.body);
    const llm = await this.container.llm(agent.provider as Provider);

    const meta = (row.inputMeta ?? {}) as { title?: string; body?: string };
    const task = meta.title ? `Review eval case "${row.name}": ${meta.title}` : `Review eval case "${row.name}"`;

    const start = Date.now();
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? 'auto',
      ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
      ...(meta.body ? { prDescription: meta.body } : {}),
      task,
    });
    const durationMs = Date.now() - start;

    const expected = parseExpectedOutput(row.expectedOutput);
    const score = scoreEvalCase(expected, outcome.review.findings);
    const citationTotal = outcome.review.findings.length + outcome.dropped.length;
    const citationAccuracy = citationTotal > 0 ? outcome.review.findings.length / citationTotal : 1;
    const pass = score.recall === 1 && score.precision === 1;

    const saved = await this.repo.insertRun({
      caseId,
      actualOutput: outcome.review.findings,
      pass,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy,
      durationMs,
      costUsd: outcome.costUsd,
    });
    return toEvalCaseRunDto(saved);
  }

  /** "Run eval (N)" — every case in the workspace, sequentially (real LLM
   *  calls; sequential keeps cost/rate predictable over parallel fan-out). */
  async runAllForWorkspace(workspaceId: string): Promise<EvalRun> {
    const cases = await this.repo.allCasesForWorkspace(workspaceId);
    const perTrace: EvalPerTrace[] = [];
    let tracesPassed = 0;
    let durationTotal = 0;
    let costTotal: number | null = 0;
    const recalls: number[] = [];
    const precisions: number[] = [];
    const citations: number[] = [];

    for (const c of cases) {
      if (c.ownerKind !== 'agent') continue; // skill-owned cases aren't runnable yet
      let run: EvalCaseRun;
      try {
        run = await this.runCase(workspaceId, c.id);
      } catch {
        continue; // one bad case (e.g. missing owner) doesn't sink the whole batch
      }
      perTrace.push({
        name: c.name,
        pass: run.pass ?? false,
        expected: c.expectedOutput,
        actual: run.actual_output,
      });
      if (run.pass) tracesPassed++;
      if (run.duration_ms != null) durationTotal += run.duration_ms;
      costTotal = costTotal == null || run.cost_usd == null ? null : costTotal + run.cost_usd;
      if (run.recall != null) recalls.push(run.recall);
      if (run.precision != null) precisions.push(run.precision);
      if (run.citation_accuracy != null) citations.push(run.citation_accuracy);
    }

    const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      recall: avg(recalls),
      precision: avg(precisions),
      citation_accuracy: avg(citations),
      traces_passed: tracesPassed,
      traces_total: perTrace.length,
      duration_ms: durationTotal,
      cost_usd: costTotal,
      per_trace: perTrace,
    };
  }

  /** Global Eval Dashboard summary. */
  async dashboard(workspaceId: string) {
    const [cases, recent, runsTotal] = await Promise.all([
      this.repo.allCasesForWorkspace(workspaceId),
      this.repo.recentRunsForWorkspace(workspaceId, DASHBOARD_RECENT_RUNS_LIMIT),
      this.repo.countRunsForWorkspace(workspaceId),
    ]);
    const trend = recent
      .slice(0, DASHBOARD_TREND_LIMIT)
      .reverse()
      .map((r) => ({
        label: r.run.ranAt.toISOString(),
        recall: r.run.recall ?? 0,
        precision: r.run.precision ?? 0,
        citation: r.run.citationAccuracy ?? 0,
      }));
    return {
      cases_total: cases.length,
      runs_total: runsTotal,
      trend,
      recent_runs: recent.map((r) => ({
        case_name: r.caseName,
        ...toEvalCaseRunDto(r.run),
      })),
    };
  }
}
