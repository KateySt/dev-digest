import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './platform/config.js';
import { createDb } from './db/client.js';
import { Container } from './platform/container.js';
import { buildMcpServer } from './modules/mcp/server.js';

/**
 * MCP entrypoint. `pnpm mcp` runs `tsx src/mcp.ts` (stdio transport — a local
 * MCP client like Claude Code spawns this process directly, see root
 * `.mcp.json`). Mirrors `server.ts`'s composition (loadConfig → createDb →
 * Container) but talks stdio instead of listening on a port.
 *
 * NEVER write to stdout here outside the SDK's own protocol traffic — stdout
 * IS the JSON-RPC wire for this transport. Use console.error (stderr) for
 * any local diagnostics.
 */
async function main() {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl);
  const container = new Container(config, handle.db);

  // Single default workspace (LocalNoAuthProvider) — resolved once up front
  // since there is no per-request object to scope by over stdio.
  const workspace = await container.auth.currentWorkspace(undefined);

  const server = buildMcpServer(container, workspace.id);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown: close the MCP connection, then the db pool. Guarded so
  // a second signal during shutdown doesn't double-close (same pattern as
  // server.ts).
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      try {
        await server.close();
        await handle.close();
        process.exit(0);
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
