import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateEvalCaseFromFindingBody,
  EvalCaseKind,
  EvalOwnerKind,
  EvalRange,
  StartSkillEvalRunBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * eval module.
 *   GET    /eval-cases?owner_kind=&owner_id=  -> list for an owner (Evals tab)
 *   GET    /eval-cases/:id                    -> one case (editor modal)
 *   POST   /eval-cases                        -> create (source: manual)
 *   PUT    /eval-cases/:id                    -> update
 *   DELETE /eval-cases/:id                    -> delete
 *   POST   /eval-cases/:id/run                -> run ONE case (no suite link) -> EvalCaseRun
 *   POST   /findings/:id/eval-case            -> turn a decided finding into a case ({ target? } agent | linked skill)
 *   POST   /agents/:id/eval-runs              -> start a background suite run (202)
 *   GET    /agents/:id/eval-runs?range=       -> suite runs + history + regression alert
 *   GET    /agents/:id/eval-runs/compare      -> compare two suite runs
 *   GET    /eval-suite-runs/:id               -> suite run progress + per-case results (agent, skill or draft run)
 *   GET    /agents/:id/eval-stats             -> Evals tab header (agent)
 *   GET    /skills/:id/eval-stats             -> Evals tab header (skill)
 *   POST   /skills/:id/eval-runs              -> start a skill suite run, or a draft run with { draft_body } (202)
 *   GET    /skills/:id/eval-runs?range=       -> non-draft runs + history + regression alert + latest draft
 *   GET    /skills/:id/eval-runs/compare      -> compare two skill suite runs
 *   GET    /eval-dashboard                    -> cross-agent dashboard
 *   POST   /eval-dashboard/run-all            -> "Run all agents" (202)
 *   GET    /eval-dashboard/skills             -> cross-skill dashboard
 *   POST   /eval-dashboard/skills/run-all     -> "Run all skills" (202)
 *
 * (The old `POST /skills/:id/eval-cases/run-all` batch route was removed in SPEC-08.)
 */

const ListQuery = z.object({ owner_kind: EvalOwnerKind, owner_id: z.string() });

const CreateEvalCaseBody = z.object({
  owner_kind: EvalOwnerKind,
  kind: EvalCaseKind.optional(),
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
});

const RunsQuery = z.object({ range: EvalRange.default('all') });
const CompareQuery = z.object({ base: z.string().uuid(), head: z.string().uuid() });

/** Each start fans out to expensive LLM calls — same tight limit as review triggers. */
const RUN_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

const UpdateEvalCaseBody = z.object({
  name: z.string().min(1).optional(),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
});

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container, app.log);

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
    return service.statsForOwner(workspaceId, 'agent', req.params.id);
  });

  app.get('/skills/:id/eval-stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.statsForOwner(workspaceId, 'skill', req.params.id);
  });

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, body: CreateEvalCaseFromFindingBody.nullish() } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.createFromFinding(workspaceId, req.params.id, req.body?.target);
      reply.status(201);
      return evalCase;
    },
  );

  app.post(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, body: StartSkillEvalRunBody.nullish() }, config: RUN_RATE_LIMIT },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.startSkillRun(workspaceId, req.params.id, req.body?.draft_body);
      reply.status(202);
      return started;
    },
  );

  app.get(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, querystring: RunsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listSkillRuns(workspaceId, req.params.id, req.query.range);
    },
  );

  app.get(
    '/skills/:id/eval-runs/compare',
    { schema: { params: IdParams, querystring: CompareQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.compareSkillRuns(workspaceId, req.params.id, req.query.base, req.query.head);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams }, config: RUN_RATE_LIMIT },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.startAgentRun(workspaceId, req.params.id);
      reply.status(202);
      return started;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: RunsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listAgentRuns(workspaceId, req.params.id, req.query.range);
    },
  );

  app.get(
    '/agents/:id/eval-runs/compare',
    { schema: { params: IdParams, querystring: CompareQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.compare(workspaceId, req.params.id, req.query.base, req.query.head);
    },
  );

  app.get('/eval-suite-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getSuiteRun(workspaceId, req.params.id);
  });

  app.get('/eval-dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });

  app.post('/eval-dashboard/run-all', { config: RUN_RATE_LIMIT }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.runAllAgents(workspaceId);
    reply.status(202);
    return result;
  });

  app.get('/eval-dashboard/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDashboard(workspaceId);
  });

  app.post('/eval-dashboard/skills/run-all', { config: RUN_RATE_LIMIT }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.runAllSkills(workspaceId);
    reply.status(202);
    return result;
  });
}
