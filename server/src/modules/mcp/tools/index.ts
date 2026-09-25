import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Container } from '../../../platform/container.js';
import { registerListAgents } from './list-agents.js';
import { registerRunAgentOnPr } from './run-agent-on-pr.js';
import { registerGetFindings } from './get-findings.js';
import { registerGetConventions } from './get-conventions.js';
import { registerGetBlastRadius } from './get-blast-radius.js';

/** Registers all 5 MCP tools against `server`, each scoped to `workspaceId`
 *  (the single default workspace — see server/AGENTS.md on LocalNoAuthProvider). */
export function registerTools(server: McpServer, container: Container, workspaceId: string): void {
  registerListAgents(server, container, workspaceId);
  registerRunAgentOnPr(server, container, workspaceId);
  registerGetFindings(server, container, workspaceId);
  registerGetConventions(server, container, workspaceId);
  registerGetBlastRadius(server, container, workspaceId);
}
