import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentService } from './service.js';

/**
 * multi-agent module (SPEC-10).
 *   GET  /multi-agent-runs/estimates     -> per-agent estimates + review_concurrency
 *   GET  /multi-agent-runs?pr_id=&limit= -> recent multi-runs, newest first (bare array)
 *   GET  /multi-agent-runs/:id           -> results (columns, groups, conflicts, totals)
 *   POST /multi-agent-runs/:id/cancel    -> cancel every queued/running child
 * `estimates` is a static segment, so find-my-way matches it before `/:id`.
 */
const ListQuery = z.object({
  pr_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new MultiAgentService(container);

  app.get('/multi-agent-runs/estimates', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.estimates(workspaceId);
  });

  app.get('/multi-agent-runs', { schema: { querystring: ListQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.query.pr_id, req.query.limit);
  });

  app.get('/multi-agent-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  // Same tight limit as the review trigger.
  app.post(
    '/multi-agent-runs/:id/cancel',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.cancel(workspaceId, req.params.id);
    },
  );
}
