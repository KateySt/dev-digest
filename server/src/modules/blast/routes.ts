import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastService } from './service.js';

/**
 * blast module.
 *   GET /pulls/:id/blast → the PR's derived blast radius (changed symbols →
 *                           downstream callers → affected endpoints/crons),
 *                           computed + cached on first request if not already
 *                           fresh for the current head sha.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);
  const reviewRepo = container.reviewRepo;

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const pull = await reviewRepo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    return service.getOrCompute(workspaceId, pull);
  });
}
