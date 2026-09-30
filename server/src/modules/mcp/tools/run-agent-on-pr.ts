import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Container } from '../../../platform/container.js';
import type { RunBus } from '../../../platform/sse.js';
import { NotFoundError } from '../../../platform/errors.js';
import { ReviewService } from '../../reviews/service.js';
import { TOOL_NAMES, DEFAULT_WAIT_TIMEOUT_MS } from '../constants.js';
import { describeError, errorResult, jsonResult, trimReview } from '../dto.js';

export interface RunAgentOnPrInput {
  pr_id: string;
  agent_id?: string;
  all?: boolean;
  wait_timeout_ms?: number;
}

export interface RunAgentOnPrDeps {
  reviewService: Pick<ReviewService, 'resolveTargets' | 'runReview' | 'reviewsForPull' | 'listRuns'>;
  runBus: Pick<RunBus, 'onDone'>;
}

/**
 * NotFoundError('Agent not found') only ever comes from `resolveTargets`
 * (a bad agent_id) — every OTHER NotFoundError this flow can throw (pull/repo
 * not found, from `runReview`) already has its own clear message, so only
 * this specific one gets the "check list_agents" hint appended.
 */
function describeRunError(err: unknown): string {
  if (err instanceof NotFoundError && err.message === 'Agent not found') {
    return 'Agent not found — check list_agents for a valid agent_id.';
  }
  return describeError(err);
}

/** Resolves once every runId in `runIds` has completed, or `false` on timeout. */
function waitForAllDone(runBus: Pick<RunBus, 'onDone'>, runIds: string[], timeoutMs: number): Promise<boolean> {
  if (runIds.length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let remaining = runIds.length;
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    for (const runId of runIds) {
      runBus.onDone(runId, () => {
        remaining -= 1;
        if (remaining === 0) finish(true);
      });
    }
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/** Pure handler body — takes already-constructed deps so unit tests can mock
 *  `reviewService`/`runBus` without a real Container/DB. */
export function buildRunAgentOnPrHandler(deps: RunAgentOnPrDeps, workspaceId: string) {
  return async (args: RunAgentOnPrInput): Promise<CallToolResult> => {
    try {
      // Let ReviewService.resolveTargets's own validation surface as the tool
      // error when neither agent_id nor all:true was given (AppError
      // 'invalid_run_request') — no need to re-validate here.
      const targets = await deps.reviewService.resolveTargets(workspaceId, {
        ...(args.agent_id !== undefined ? { agentId: args.agent_id } : {}),
        ...(args.all !== undefined ? { all: args.all } : {}),
      });
      const { runs } = await deps.reviewService.runReview(workspaceId, args.pr_id, targets);
      const runIds = runs.map((r) => r.run_id);

      const timeoutMs = args.wait_timeout_ms ?? DEFAULT_WAIT_TIMEOUT_MS;
      const allDone = await waitForAllDone(deps.runBus, runIds, timeoutMs);
      if (!allDone) {
        return jsonResult({ status: 'running', run_ids: runIds });
      }

      const reviews = await deps.reviewService.reviewsForPull(workspaceId, args.pr_id);
      const relevant = reviews.filter((r) => r.run_id != null && runIds.includes(r.run_id));

      // A run that finished with NO review (e.g. `container.llm(provider)`
      // rejected with a missing-key ConfigError deep inside the fire-and-forget
      // executor — runReview/resolveTargets never see that error, only the
      // agent_runs row does) would otherwise look like a silent empty result.
      // If every targeted run produced no review, surface the run's own
      // recorded failure reason instead of an empty array.
      if (relevant.length === 0 && runIds.length > 0) {
        const runs = await deps.reviewService.listRuns(workspaceId, args.pr_id);
        const failed = runs.filter((r) => runIds.includes(r.run_id) && r.status === 'failed' && r.error);
        if (failed.length > 0) {
          return errorResult(failed.map((r) => `${r.agent_name ?? r.agent_id ?? 'agent'}: ${r.error}`).join('; '));
        }
      }

      return jsonResult(relevant.map(trimReview));
    } catch (err) {
      return errorResult(describeRunError(err));
    }
  };
}

export function registerRunAgentOnPr(server: McpServer, container: Container, workspaceId: string): void {
  const handler = buildRunAgentOnPrHandler(
    { reviewService: new ReviewService(container), runBus: container.runBus },
    workspaceId,
  );
  server.registerTool(
    TOOL_NAMES.RUN_AGENT_ON_PR,
    {
      title: 'Run agent on PR',
      description:
        'Runs a review agent on a pull request and waits for it to finish, returning the verdict and ' +
        'findings in one call. Costs a real LLM call — pick a specific agent_id (from list_agents) or ' +
        'pass all:true to run every enabled agent.',
      inputSchema: {
        pr_id: z.string().describe('The pull request id to review.'),
        agent_id: z.string().optional().describe('A specific agent id (from list_agents) to run.'),
        all: z.boolean().optional().describe('Run every enabled agent instead of a single one.'),
        wait_timeout_ms: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`How long to wait for the run(s) to finish before returning "running" (default ${DEFAULT_WAIT_TIMEOUT_MS}ms).`),
      },
    },
    handler,
  );
}
