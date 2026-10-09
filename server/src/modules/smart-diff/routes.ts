import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module.
 *   GET /pulls/:id/smart-diff → the PR's files grouped by role (core/tests/
 *                                wiring/docs/boilerplate), plus split-suggestion
 *                                metadata. Computed fresh on every request —
 *                                cheap path-pattern classification, no model
 *                                call, so there's nothing worth caching.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);
  const reviewRepo = container.reviewRepo;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const pull = await reviewRepo.getPull(workspaceId, req.params.id);
      if (!pull) throw new NotFoundError('Pull request not found');
      return service.getForPull(pull.id);
    },
  );
}
