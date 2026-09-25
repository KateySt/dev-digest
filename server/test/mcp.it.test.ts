import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { buildMcpServer } from '../src/modules/mcp/server.js';
import { TOOL_NAMES } from '../src/modules/mcp/constants.js';

/**
 * End-to-end MCP smoke test: real Postgres (testcontainers), a real Container
 * wired to it, the real McpServer built by `buildMcpServer`, driven over the
 * SDK's own in-memory linked transport pair (no stdio process spawn needed).
 * Exercises `tools/list` + two real read-only tool calls against seeded data
 * (`db/seed.ts`) — no LLM in the loop, since `list_agents`/`get_findings`/
 * `get_blast_radius` never call one.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type ToolContent = { type: 'text'; text: string };

d('MCP server (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let client: Client;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;

    const container = new Container(config(), pg.handle.db);
    const server = buildMcpServer(container, workspaceId);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'devdigest-mcp-test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client?.close();
    await pg?.stop();
  });

  it('lists all 5 registered tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.values(TOOL_NAMES).sort());
  });

  it('list_agents returns the seeded built-in agents, trimmed (no system_prompt/output_schema)', async () => {
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as ToolContent[])[0]!.text);
    expect(parsed).toHaveLength(5);
    expect(parsed.map((a: { name: string }) => a.name)).toContain('Security Reviewer');
    for (const agent of parsed) {
      expect(agent).not.toHaveProperty('system_prompt');
      expect(agent).not.toHaveProperty('output_schema');
    }
  });

  it('get_findings returns the seeded review for PR #482 without running anything new', async () => {
    const result = await client.callTool({ name: 'get_findings', arguments: { pr_id: prId } });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as ToolContent[])[0]!.text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].findings).toHaveLength(2);
    expect(parsed[0].findings.some((f: { title: string }) => f.title.includes('Stripe secret key'))).toBe(true);
  });

  it('get_blast_radius returns a clear "not found" tool error for an unknown pr_id', async () => {
    const result = await client.callTool({
      name: TOOL_NAMES.GET_BLAST_RADIUS,
      arguments: { pr_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as ToolContent[])[0]!.text).toBe('Pull request not found');
  });

  it('run_agent_on_pr surfaces a clear error when neither agent_id nor all is given', async () => {
    const result = await client.callTool({
      name: TOOL_NAMES.RUN_AGENT_ON_PR,
      arguments: { pr_id: prId },
    });
    expect(result.isError).toBe(true);
    expect((result.content as ToolContent[])[0]!.text).toContain('agentId or all');
  });
});
