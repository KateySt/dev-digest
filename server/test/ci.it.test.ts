import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('ci (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(github: MockGitHubClient) {
    return buildApp({ config: config(), db: pg.handle.db, overrides: { github } });
  }

  it('GET /agents/:id/ci/preview generates a workflow + a config with resolved skill bodies', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CI Preview Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'ci-test-skill', type: 'custom', body: 'RULE: flag hardcoded secrets.' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const files = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci/preview` })).json();
    expect(files).toHaveLength(2);
    const workflow = files.find((f: { path: string }) => f.path.includes('.github/workflows/'));
    const configFile = files.find((f: { path: string }) => f.path.includes('.devdigest/'));
    expect(workflow.content).toContain('pull_request');
    expect(workflow.content).toContain('OPENAI_API_KEY');
    const parsedConfig = JSON.parse(configFile.content);
    expect(parsedConfig.skills).toEqual(['RULE: flag hardcoded secrets.']);

    await app.close();
  });

  it('publish commits files + opens a PR using the target repo default branch; a second publish reuses the same PR', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CI Publish Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    await pg.handle.db.insert(t.repos).values({
      workspaceId,
      owner: 'acme',
      name: 'ci-target-repo',
      fullName: 'acme/ci-target-repo',
      defaultBranch: 'develop',
    });

    const first = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/ci/publish`,
      payload: { repo: 'acme/ci-target-repo' },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.republished).toBe(false);
    expect(github.committed).toHaveLength(1);
    expect(github.committed[0]!.base).toBe('develop'); // resolved from the seeded repo's default branch
    expect(github.committed[0]!.branch).toBe('devdigest/ci-ci-publish-agent');
    expect(github.committed[0]!.files.map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-ci-publish-agent.yml',
      '.devdigest/ci-publish-agent.json',
    ]);
    expect(github.openedPrs).toHaveLength(1);

    const installations = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` })).json();
    expect(installations).toHaveLength(1);
    expect(installations[0].repo).toBe('acme/ci-target-repo');

    // Re-publish ("Update CI") — commits again, but reuses the existing PR
    // instead of opening a second one.
    const second = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/ci/publish`,
      payload: { repo: 'acme/ci-target-repo' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().republished).toBe(true);
    expect(github.committed).toHaveLength(2);
    expect(github.openedPrs).toHaveLength(1); // still just the one PR

    await app.close();
  });

  it('publish falls back to "main" when the target repo is not tracked in this workspace', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CI Fallback Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/ci/publish`,
      payload: { repo: 'someone-else/untracked-repo' },
    });
    expect(github.committed[0]!.base).toBe('main');

    await app.close();
  });

  it('rejects a malformed repo (not "owner/name")', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CI Bad Repo Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/ci/publish`,
      payload: { repo: 'not-a-valid-repo' },
    });
    expect(res.statusCode).toBe(422);
    expect(github.committed).toHaveLength(0);

    await app.close();
  });

  it('GET /ci-runs returns an empty list (no CI runner exists yet to ever populate it)', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const res = await app.inject({ method: 'GET', url: '/ci-runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('B12: GET /ci-runs?since=foo is a 422 validation error; an ISO datetime with offset is accepted', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);

    const bad = await app.inject({ method: 'GET', url: '/ci-runs?since=foo' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');

    const since = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
    const ok = await app.inject({ method: 'GET', url: `/ci-runs?since=${since}` });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });
});
