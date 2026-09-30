import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { HistoryService } from './service.js';

/**
 * history module.
 *   GET /pulls/:id/history → prior merged/closed PRs in the same repo that
 *                             touched at least one file this PR also
 *                             changed ("Prior PRs touching these files").
 *                             No `?force` param — nothing to cache/bust, see
 *                             `HistoryService`'s doc comment.
 */
export default async function historyRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new HistoryService(container);
  const reviewRepo = container.reviewRepo;

  app.get('/pulls/:id/history', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const pull = await reviewRepo.getPull(workspaceId, req.params.id);
    if (!pull) throw new NotFoundError('Pull request not found');
    return service.getHistory(workspaceId, pull);
  });
}
