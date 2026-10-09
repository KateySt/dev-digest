import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   GET  /repos/:id/conventions          → list a repo's candidates
 *   POST /repos/:id/conventions/extract  → (re)scan; returns the full list
 *   PATCH /conventions/:id               → accept/reject (status) and/or edit
 *                                            one candidate's rule text
 */

const PatchConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { rule, status } = req.body;
      if (rule === undefined && status === undefined) {
        throw new ValidationError('No fields to update');
      }
      let result: ConventionCandidate | undefined;
      if (rule !== undefined) {
        result = await service.updateRule(workspaceId, req.params.id, rule);
      }
      if (status !== undefined) {
        result = await service.setStatus(workspaceId, req.params.id, status);
      }
      return result!;
    },
  );
}
