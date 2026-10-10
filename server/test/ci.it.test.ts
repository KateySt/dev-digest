import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('ci (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(github: MockGitHubClient) {
    // Mock the skill_scan provider (default: openrouter) with a clean result,
    // so creating a skill never hits the network or fails closed without a key.
    const llm = { openrouter: new MockLLMProvider('openrouter', { structured: { findings: [] } }) };
    return buildApp({ config: config(), db: pg.handle.db, overrides: { github, llm } });
  }

  it('GET /ci-runs returns an empty list when nothing has been ingested', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const res = await app.inject({ method: 'GET', url: '/ci-runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });
});
