import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Container } from '../../platform/container.js';
import { registerTools } from './tools/index.js';

/**
 * Pure wiring: builds a configured McpServer over an already-constructed
 * Container, analogous to what `app.ts` does for Fastify. Kept separate from
 * `src/mcp.ts` (the process entrypoint) so it's unit-testable without stdio —
 * tests can `connect()` the returned server to an in-memory transport instead.
 *
 * `workspaceId` is resolved once by the caller (MVP is single-workspace, no
 * auth/request object to scope by — see `LocalNoAuthProvider`) and threaded
 * into every tool handler.
 */
export function buildMcpServer(container: Container, workspaceId: string): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });
  registerTools(server, container, workspaceId);
  return server;
}
