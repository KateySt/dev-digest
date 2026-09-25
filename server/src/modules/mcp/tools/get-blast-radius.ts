import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Container } from '../../../platform/container.js';
import { NotFoundError } from '../../../platform/errors.js';
import { ReviewRepository } from '../../reviews/repository.js';
import { BlastService } from '../../blast/service.js';
import { TOOL_NAMES } from '../constants.js';
import { jsonResult, safeToolCall } from '../dto.js';

export interface GetBlastRadiusInput {
  pr_id: string;
}

export interface GetBlastRadiusDeps {
  reviewRepo: Pick<ReviewRepository, 'getPull'>;
  blastService: Pick<BlastService, 'getOrCompute'>;
}

/** Pure handler body — takes already-constructed deps so unit tests can mock
 *  `reviewRepo`/`blastService` without a real Container/DB. */
export function buildGetBlastRadiusHandler(deps: GetBlastRadiusDeps, workspaceId: string) {
  return async (args: GetBlastRadiusInput): Promise<CallToolResult> =>
    safeToolCall(async () => {
      const pull = await deps.reviewRepo.getPull(workspaceId, args.pr_id);
      if (!pull) throw new NotFoundError('Pull request not found');
      const radius = await deps.blastService.getOrCompute(workspaceId, pull);
      return jsonResult(radius);
    });
}

export function registerGetBlastRadius(server: McpServer, container: Container, workspaceId: string): void {
  const handler = buildGetBlastRadiusHandler(
    { reviewRepo: container.reviewRepo, blastService: new BlastService(container) },
    workspaceId,
  );
  server.registerTool(
    TOOL_NAMES.GET_BLAST_RADIUS,
    {
      title: 'Get blast radius',
      description:
        "Maps what a PR's diff might affect beyond the changed lines: declared symbols, their callers, and " +
        'dependent HTTP endpoints/crons. Pure cached lookup — no AI, no live analysis, typically <200ms.',
      inputSchema: {
        pr_id: z.string().describe('The pull request id to compute the blast radius for.'),
      },
    },
    handler,
  );
}
