import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { RisksService } from './service.js';

/**
 * risks module.
 *   GET /pulls/:id/risks → the PR's derived merge-risk brief (computed +
 *                           cached on first request if not already fresh for
 *                           the current head sha). `?force=true` bypasses the
 *                           cache and always re-derives (PR Brief refresh).
 */

const RisksQuery = z.object({ force: z.enum(['true', 'false']).optional() });

export default async function risksRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new RisksService(container);
  const reviewRepo = container.reviewRepo;

  app.get('/pulls/:id/risks', { schema: { params: IdParams, querystring: RisksQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const pull = await reviewRepo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    const force = req.query.force === 'true';
    return service.getOrCompute(workspaceId, pull, undefined, force);
  });
}
