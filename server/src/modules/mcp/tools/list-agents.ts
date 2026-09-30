import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Container } from '../../../platform/container.js';
import { AgentsService } from '../../agents/service.js';
import { TOOL_NAMES } from '../constants.js';
import { jsonResult, safeToolCall, trimAgent } from '../dto.js';

export interface ListAgentsDeps {
  agentsService: Pick<AgentsService, 'list'>;
}

/** Pure handler body — takes already-constructed deps so unit tests can mock
 *  `agentsService` without a real Container/DB. */
export function buildListAgentsHandler(deps: ListAgentsDeps, workspaceId: string) {
  return async (): Promise<CallToolResult> =>
    safeToolCall(async () => {
      const agents = await deps.agentsService.list(workspaceId);
      return jsonResult(agents.map(trimAgent));
    });
}

export function registerListAgents(server: McpServer, container: Container, workspaceId: string): void {
  const handler = buildListAgentsHandler({ agentsService: new AgentsService(container) }, workspaceId);
  server.registerTool(
    TOOL_NAMES.LIST_AGENTS,
    {
      title: 'List agents',
      description:
        'Lists the review agents configured in this workspace (id, name, provider, model, enabled). ' +
        'Use this first to get a valid agent_id before calling run_agent_on_pr.',
      inputSchema: {},
    },
    handler,
  );
}
