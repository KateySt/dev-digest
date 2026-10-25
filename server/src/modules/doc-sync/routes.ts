import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DocSyncRepoUpdate, DocSyncScheduleUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DocSyncService } from './service.js';

/**
 * Docs Sync module (server/specs/doc-sync.md).
 *   GET   /doc-sync/schedule   → schedule + server-computed next_run_at
 *   PUT   /doc-sync/schedule   → save the rule / one-off override
 *   POST  /doc-sync/run        → start a run now (409 while one is running)
 *   GET   /doc-sync/runs       → latest runs with per-repo results
 *   GET   /doc-sync/repos      → repos with their opt-in state
 *   PATCH /repos/:id/doc-sync  → opt a repo in/out, clear its dismissed suggestions
 *
 * Also owns the scheduler ticker: started here (not under NODE_ENV=test) and
 * stopped on close.
 */
export default async function docSyncRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new DocSyncService(container);
  service.registerJobHandler();

  if (container.config.nodeEnv !== 'test') {
    await service.startScheduler(app.log);
    app.addHook('onClose', async () => service.stopScheduler());
  }

  app.get('/doc-sync/schedule', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getSchedule(workspaceId);
  });

  app.put('/doc-sync/schedule', { schema: { body: DocSyncScheduleUpdate } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.updateSchedule(workspaceId, req.body);
  });

  app.post('/doc-sync/run', async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    reply.code(202);
    return service.startRun(workspaceId, 'manual');
  });

  app.get('/doc-sync/runs', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId);
  });

  app.get('/doc-sync/repos', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRepos(workspaceId);
  });

  app.patch('/repos/:id/doc-sync', { schema: { params: IdParams, body: DocSyncRepoUpdate } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.updateRepo(workspaceId, req.params.id, req.body);
  });
}
