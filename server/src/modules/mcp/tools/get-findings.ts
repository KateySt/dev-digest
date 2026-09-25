import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Container } from '../../../platform/container.js';
import { ReviewService } from '../../reviews/service.js';
import { TOOL_NAMES } from '../constants.js';
import { jsonResult, safeToolCall, trimReview } from '../dto.js';

export interface GetFindingsInput {
  pr_id: string;
  agent_id?: string;
}

export interface GetFindingsDeps {
  reviewService: Pick<ReviewService, 'reviewsForPull'>;
}

/** Pure handler body — takes already-constructed deps so unit tests can mock
 *  `reviewService` without a real Container/DB. */
export function buildGetFindingsHandler(deps: GetFindingsDeps, workspaceId: string) {
  return async (args: GetFindingsInput): Promise<CallToolResult> =>
    safeToolCall(async () => {
      const reviews = await deps.reviewService.reviewsForPull(workspaceId, args.pr_id);
      // Empty findings array (or empty reviews list) is a valid, non-error result.
      const filtered = args.agent_id ? reviews.filter((r) => r.agent_id === args.agent_id) : reviews;
      return jsonResult(filtered.map(trimReview));
    });
}

export function registerGetFindings(server: McpServer, container: Container, workspaceId: string): void {
  const handler = buildGetFindingsHandler({ reviewService: new ReviewService(container) }, workspaceId);
  server.registerTool(
    TOOL_NAMES.GET_FINDINGS,
    {
      title: 'Get findings',
      description:
        'Returns the findings from the most recent completed review run(s) for a pull request — does not ' +
        'run anything new. Pass agent_id to scope to one agent, or omit for all agents that have reviewed this PR.',
      inputSchema: {
        pr_id: z.string().describe('The pull request id to read findings for.'),
        agent_id: z.string().optional().describe('Scope results to this agent only.'),
      },
    },
    handler,
  );
}
