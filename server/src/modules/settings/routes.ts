import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import {
  SettingsUpdate,
  ConnTestRequest,
  type ConnTestResult,
  type SecretsStatus,
  type CatalogTestResult,
} from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings module.
 *   GET  /settings                 → current non-secret prefs
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/GitHub)
 *   POST /settings/catalog-test    → test the community skill catalog (SPEC-07)
 *
 * Secrets are NOT stored here — only non-secret prefs. test-connection does a
 * cheap live call (listModels / GET user) with the stored key, or — when the UI
 * sends a new key — with that key on a throwaway client, persisting it through
 * SecretsProvider only if the call succeeds.
 */

const CatalogTestBody = z.object({
  /** Optional unsaved override to test WITHOUT persisting it (client spec
   *  C-AC-34) — falls back to the resolved stored/env value when absent. */
  repo: z.string().optional(),
});

export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return {
      ...rowsToSettings(rows),
      community_catalog_repo_default: container.config.communityCatalogRepoDefault,
    };
  });

  // Which provider keys are configured (booleans only — the values are NEVER
  // returned). Drives the "Configured / Not set" badges in the API Keys panel.
  app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
    await getContext(container, req);
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await getContext(container, req);
    const body = req.body;
    for (const [key, value] of Object.entries(body)) {
      await container.db
        .insert(t.settings)
        .values({ workspaceId, userId, key, value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    }
    const rows = await container.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return {
      ...rowsToSettings(rows),
      community_catalog_repo_default: container.config.communityCatalogRepoDefault,
    };
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<ConnTestResult> => {
      const { provider, key } = req.body;
      try {
        // A UI-supplied key (BYO key) is verified on a throwaway client FIRST and
        // persisted only when the live call succeeds — a rejected key must never
        // overwrite a working one or show up as "configured".
        if (key && !container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        let message: string;
        if (provider === GITHUB_PROVIDER) {
          const gh = key ? container.probeClient(provider, key) : await container.github();
          message = `Connected as @${await gh.currentLogin()}`;
        } else {
          const llm = key ? container.probeClient(provider, key) : await container.llm(provider);
          message = `OK — ${(await llm.listModels()).length} models available`;
        }
        if (key) {
          await container.secrets.set?.(SECRET_KEY_BY_PROVIDER[provider], key);
          container.invalidateSecretCaches();
        }
        return { provider, ok: true, message };
      } catch (err) {
        return { provider, ok: false, message: (err as Error).message };
      }
    },
  );

  // SPEC-07 — resolves + attempts a listing; never modifies the stored
  // setting. `repo` lets the client test an unsaved edit (client AC-34).
  app.post(
    '/settings/catalog-test',
    {
      schema: { body: CatalogTestBody },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<CatalogTestResult> => {
      const { workspaceId } = await getContext(container, req);
      return container.skillsService.testCatalogConnection(workspaceId, req.body.repo);
    },
  );
}
