import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IntentService } from './service.js';

/**
 * intent module.
 *   GET /pulls/:id/intent → the PR's derived intent (computed + cached on
 *                            first request if not already fresh for the
 *                            current head sha). `?force=true` bypasses the
 *                            cache and always re-derives (PR Brief refresh).
 */

const IntentQuery = z.object({ force: z.enum(['true', 'false']).optional() });

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new IntentService(container);
  const reviewRepo = container.reviewRepo;

  app.get('/pulls/:id/intent', { schema: { params: IdParams, querystring: IntentQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const pull = await reviewRepo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const force = req.query.force === 'true';
    return service.getOrCompute(workspaceId, pull, repo, undefined, force);
  });
}
