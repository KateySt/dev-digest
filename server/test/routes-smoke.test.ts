import { describe, it, expect, } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import type { SecretKey, SecretsProvider } from '@devdigest/shared';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  describe('POST /settings/test-connection with a new key — verify before persisting', () => {
    /** Writable in-memory store, so the test can see what got persisted. */
    class MemorySecrets implements SecretsProvider {
      constructor(public data: Record<string, string> = {}) {}
      async get(key: SecretKey) {
        return this.data[key as string];
      }
      async set(key: SecretKey, value: string) {
        this.data[key as string] = value;
      }
    }
    class RejectingLLM extends MockLLMProvider {
      override async listModels(): Promise<never> {
        throw new Error('401 Incorrect API key provided');
      }
    }
    class RejectingGitHub extends MockGitHubClient {
      override async currentLogin(): Promise<never> {
        throw new Error('Bad credentials');
      }
    }

    it('a rejected LLM key is NOT saved and the previous key survives', async () => {
      const secrets = new MemorySecrets({ OPENAI_API_KEY: 'sk-old-working' });
      const app = await buildApp({ config, overrides: { secrets, llm: { openai: new RejectingLLM('openai') } } });
      const res = await app.inject({
        method: 'POST',
        url: '/settings/test-connection',
        payload: { provider: 'openai', key: 'sk-bad' },
      });
      expect(res.json()).toMatchObject({ provider: 'openai', ok: false, message: '401 Incorrect API key provided' });
      expect(secrets.data).toEqual({ OPENAI_API_KEY: 'sk-old-working' });
      await app.close();
    });

    it('a rejected GitHub token is NOT saved', async () => {
      const secrets = new MemorySecrets();
      const app = await buildApp({ config, overrides: { secrets, github: new RejectingGitHub() } });
      const res = await app.inject({
        method: 'POST',
        url: '/settings/test-connection',
        payload: { provider: 'github', key: 'ghp_bad' },
      });
      expect(res.json()).toMatchObject({ ok: false, message: 'Bad credentials' });
      expect(secrets.data).toEqual({});
      await app.close();
    });

    it('a verified key is saved and reported as configured', async () => {
      const secrets = new MemorySecrets();
      const app = await buildApp({
        config,
        overrides: { secrets, llm: { anthropic: new MockLLMProvider('anthropic') } },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/settings/test-connection',
        payload: { provider: 'anthropic', key: 'sk-ant-good' },
      });
      expect(res.json()).toMatchObject({ provider: 'anthropic', ok: true });
      expect(secrets.data).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-good' });
      await app.close();
    });

    it('refuses a new key when the secrets backend is read-only', async () => {
      const readOnly: SecretsProvider = { get: async () => undefined };
      const app = await buildApp({ config, overrides: { secrets: readOnly, llm: { openai: new MockLLMProvider('openai') } } });
      const res = await app.inject({
        method: 'POST',
        url: '/settings/test-connection',
        payload: { provider: 'openai', key: 'sk-x' },
      });
      expect(res.json()).toMatchObject({ ok: false, message: 'Secrets backend is read-only' });
      await app.close();
    });
  });

  describe('GET /settings/github-account', () => {
    it('returns the token account with its avatar', async () => {
      const app = await buildApp({ config, overrides: { github: new MockGitHubClient({ login: 'octocat' }) } });
      const res = await app.inject({ method: 'GET', url: '/settings/github-account' });
      expect(res.json()).toEqual({
        account: {
          login: 'octocat',
          avatar_url: 'https://github.com/octocat.png?size=64',
          html_url: 'https://github.com/octocat',
        },
      });
      await app.close();
    });

    it('memoizes the login until the secrets change', async () => {
      let calls = 0;
      class CountingGitHub extends MockGitHubClient {
        override async currentLogin() {
          calls += 1;
          return 'octocat';
        }
      }
      const app = await buildApp({ config, overrides: { github: new CountingGitHub() } });
      await app.inject({ method: 'GET', url: '/settings/github-account' });
      await app.inject({ method: 'GET', url: '/settings/github-account' });
      expect(calls).toBe(1);
      app.container.invalidateSecretCaches();
      await app.inject({ method: 'GET', url: '/settings/github-account' });
      expect(calls).toBe(2);
      await app.close();
    });

    it('returns account: null when GitHub rejects the token', async () => {
      class RejectingGitHub extends MockGitHubClient {
        override async currentLogin(): Promise<never> {
          throw new Error('Bad credentials');
        }
      }
      const app = await buildApp({ config, overrides: { github: new RejectingGitHub() } });
      const res = await app.inject({ method: 'GET', url: '/settings/github-account' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ account: null });
      await app.close();
    });
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/smart-diff rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/risks rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/risks' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/risks rejects a non-boolean ?force with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/risks?force=notabool',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/intent rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/intent' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/intent rejects a non-boolean ?force with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/intent?force=notabool',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/blast rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/commits rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/commits' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /pulls/:id/history rejects a non-uuid :id with 422 (no DB touch)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/history' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
