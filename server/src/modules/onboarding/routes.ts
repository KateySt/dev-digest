/**
 * onboarding HTTP module (SPEC-06).
 *
 *   GET  /repos/:id/onboarding           → the stored tour, an explicit
 *                                           not-yet-generated state, or a
 *                                           not-generatable missing-clone
 *                                           state. Never starts generation
 *                                           (S-AC-1, S-AC-6).
 *   POST /repos/:id/onboarding/generate  → enqueues a GENERATE_JOB_KIND job,
 *                                           202 + jobId — mirrors
 *                                           `POST /repos/:id/resync`'s
 *                                           always-202 shape exactly.
 *
 * Job-handler registration lives here (once, at plugin load), mirroring
 * `repo-intel/routes.ts:29`. No business logic in this file — zod-validated
 * params, `getContext()` tenancy, and delegation to `OnboardingService`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OnboardingService(container);
  service.registerGenerateJobHandler();

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    // Tenancy resolved so the request is workspace-scoped even though the
    // read itself doesn't need workspaceId (consistent with repo-intel's
    // /index-state route).
    await getContext(container, req);
    const result = await service.getTour(req.params.id);
    if (result.state === 'generated') {
      return { state: 'generated' as const, ...result.tour };
    }
    return result;
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.requestGeneration(workspaceId, req.params.id);
    reply.code(202);
    if ('jobId' in result) {
      return { status: 'accepted', jobId: result.jobId };
    }
    return { status: 'accepted', degraded: true, reason: result.reason };
  });
}
