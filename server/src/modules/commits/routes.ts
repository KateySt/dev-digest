import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { CommitsService } from './service.js';

/**
 * commits module.
 *   GET /pulls/:id/commits → the PR's commit history for the Overview tab's
 *                             "Commits" panel (each commit's changed files,
 *                             annotated with the worst finding severity from
 *                             the latest review). Commit→files is permanently
 *                             cached server-side, so no `?force` param here —
 *                             nothing to invalidate (see `CommitsService`).
 */
export default async function commitsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new CommitsService(container);
  const reviewRepo = container.reviewRepo;

  app.get('/pulls/:id/commits', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const pull = await reviewRepo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    return service.getCommitHistory(workspaceId, pull);
  });
}
