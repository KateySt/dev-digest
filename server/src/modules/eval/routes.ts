import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * eval module.
 *   GET    /eval-cases?owner_kind=&owner_id=  → list for an owner (Evals tab)
 *   GET    /eval-cases/:id                    → one case (editor modal)
 *   POST   /eval-cases                        → create
 *   PUT    /eval-cases/:id                    → update
 *   DELETE /eval-cases/:id                    → delete
 *   POST   /eval-cases/:id/run                → run ONE case → EvalCaseRun
 *   GET    /agents/:id/eval-stats             → Evals tab header rollup
 *   GET    /eval-dashboard                    → global Eval Dashboard
 *   POST   /eval-dashboard/run-all            → "Run eval (N)" → EvalRun (batch)
 */

const ListQuery = z.object({ owner_kind: EvalOwnerKind, owner_id: z.string() });

const CreateEvalCaseBody = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().optional(),
});

const UpdateEvalCaseBody = z.object({
  name: z.string().min(1).optional(),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().optional(),
});

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.get('/eval-cases', { schema: { querystring: ListQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForOwner(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.get('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.get(workspaceId, req.params.id);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    return evalCase;
  });

  app.post('/eval-cases', { schema: { body: CreateEvalCaseBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.create(workspaceId, req.body);
    reply.status(201);
    return evalCase;
  });

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.update(workspaceId, req.params.id, req.body);
      if (!evalCase) throw new NotFoundError('Eval case not found');
      return evalCase;
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  app.post('/eval-cases/:id/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runCase(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.statsForAgent(workspaceId, req.params.id);
  });

  app.get('/eval-dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });

  app.post('/eval-dashboard/run-all', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAllForWorkspace(workspaceId);
  });
}
