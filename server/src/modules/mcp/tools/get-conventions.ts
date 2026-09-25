import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ConventionStatus } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { ConventionsService } from '../../conventions/service.js';
import { TOOL_NAMES } from '../constants.js';
import { jsonResult, safeToolCall, trimConvention } from '../dto.js';

export interface GetConventionsInput {
  repo_id: string;
  status?: ConventionStatus;
}

export interface GetConventionsDeps {
  conventionsService: Pick<ConventionsService, 'list'>;
}

/** Pure handler body — takes already-constructed deps so unit tests can mock
 *  `conventionsService` without a real Container/DB. */
export function buildGetConventionsHandler(deps: GetConventionsDeps, workspaceId: string) {
  return async (args: GetConventionsInput): Promise<CallToolResult> =>
    safeToolCall(async () => {
      const rows = await deps.conventionsService.list(workspaceId, args.repo_id);
      const filtered = args.status ? rows.filter((c) => c.status === args.status) : rows;
      return jsonResult(filtered.map(trimConvention));
    });
}

export function registerGetConventions(server: McpServer, container: Container, workspaceId: string): void {
  const handler = buildGetConventionsHandler({ conventionsService: new ConventionsService(container) }, workspaceId);
  server.registerTool(
    TOOL_NAMES.GET_CONVENTIONS,
    {
      title: 'Get conventions',
      description:
        "Returns the repo's accepted/pending coding conventions (rule, category, evidence file+line). " +
        'Read-only — does not trigger a (re)scan.',
      inputSchema: {
        repo_id: z.string().describe('The repo id to read conventions for.'),
        status: z.enum(['pending', 'accepted', 'rejected']).optional().describe('Filter to one status.'),
      },
    },
    handler,
  );
}
