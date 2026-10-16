import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionCandidate, ConventionStatus, CreateSkillFromConventionsInput } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   GET  /repos/:id/conventions          → list a repo's candidates
 *   POST /repos/:id/conventions/extract  → (re)scan; returns the full list
 *   POST /repos/:id/conventions/skill    → one skill from selected accepted,
 *                                            unused candidates; links them to it
 *                                            (SPEC-2026-10-16-convention-skills)
 *   PATCH /conventions/:id               → accept/reject (status), edit one
 *                                            candidate's rule text, and/or unlink
 *                                            it from its skill (`skill_id: null`)
 */

const PatchConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  // Unlink only — linking happens through POST /repos/:id/conventions/skill (AC-8).
  skill_id: z.null().optional(),
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

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return result;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { rule, status, skill_id } = req.body;
      if (rule === undefined && status === undefined && skill_id === undefined) {
        throw new ValidationError('No fields to update');
      }
      let result: ConventionCandidate | undefined;
      // Unlink first so a combined `{ skill_id: null, status: 'rejected' }`
      // passes the in-use guard (AC-9).
      if (skill_id === null) {
        result = await service.unlink(workspaceId, req.params.id);
      }
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
