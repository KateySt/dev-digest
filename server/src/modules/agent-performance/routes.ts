import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { AgentPerformanceService } from './service.js';

/**
 * agent-performance module.
 *   GET /agents/:id/stats  → per-agent aggregate (Agent Editor Stats tab)
 *   GET /agents/:id/runs   → per-agent run history (Stats tab's table)
 *   GET /agents/performance → workspace-wide rollup (global Agent Performance page)
 */

const RunsQuery = z.object({ limit: z.coerce.number().int().positive().max(200).optional() });

export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentPerformanceService(app.container);

  app.get('/agents/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.statsForAgent(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Agent not found');
    return stats;
  });

  app.get(
    '/agents/:id/runs',
    { schema: { params: IdParams, querystring: RunsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const runs = await service.runsForAgent(workspaceId, req.params.id, req.query.limit);
      if (!runs) throw new NotFoundError('Agent not found');
      return runs;
    },
  );

  app.get('/agents/performance', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.performanceForWorkspace(workspaceId);
  });
}
