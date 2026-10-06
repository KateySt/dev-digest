import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ProjectContextService, type SaveResult } from './service.js';

/**
 * SPEC-04 — Project Context module (Ring 3: transport only, zero business
 * logic — everything delegates to ProjectContextService).
 *   GET  /repos/:id/context            → document list (AC-1..4)
 *   POST /repos/:id/context/refresh    → re-scan now (AC-3)
 *   GET  /repos/:id/context/document   → one document's content (AC-23-ish read)
 *   POST /repos/:id/context/document   → create/save (AC-23..26)
 *   GET  /agents/:id/context           → an agent's attached set, ordered
 *   POST /agents/:id/context           → whole-set replace (AC-9)
 *   GET  /skills/:id/context           → a skill's attached set, ordered
 *   POST /skills/:id/context           → whole-set replace (AC-10)
 *
 * `agent_id`/`skill_id` on the list/document GETs are the optional scope
 * that picks which model's tokenizer counts tokens (S-AC-5); the bare
 * Project Context page omits both and always gets a heuristic estimate
 * (Open question 2).
 */

const ScopeQuery = z.object({
  agent_id: z.string().uuid().optional(),
  skill_id: z.string().uuid().optional(),
});

const DocumentQuery = ScopeQuery.extend({
  path: z.string().min(1),
});

const SaveDocumentBody = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const SetDocumentsBody = z.object({
  paths: z.array(z.string()),
});

function saveErrorMessage(reason: SaveResult['reason']): string {
  switch (reason) {
    case 'no_clone':
      return 'This repo has no clone yet — nothing to save into.';
    case 'invalid_path':
      return 'Path must end in .md and live under specs/, docs/, or insights/.';
    case 'outside_clone':
      return 'Path resolves outside the repo clone.';
    default:
      return 'Could not save document.';
  }
}

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, querystring: ScopeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id, {
        agentId: req.query.agent_id,
        skillId: req.query.skill_id,
      });
    },
  );

  app.post(
    '/repos/:id/context/refresh',
    { schema: { params: IdParams, querystring: ScopeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id, {
        agentId: req.query.agent_id,
        skillId: req.query.skill_id,
      });
    },
  );

  app.get(
    '/repos/:id/context/document',
    { schema: { params: IdParams, querystring: DocumentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const doc = await service.readOne(workspaceId, req.params.id, req.query.path, {
        agentId: req.query.agent_id,
        skillId: req.query.skill_id,
      });
      if (!doc) throw new NotFoundError('Document not found');
      return doc;
    },
  );

  app.post(
    '/repos/:id/context/document',
    { schema: { params: IdParams, body: SaveDocumentBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.save(workspaceId, req.params.id, req.body.path, req.body.content);
      if (!result.ok) throw new ValidationError(saveErrorMessage(result.reason));
      reply.status(200);
      return result.document;
    },
  );

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return service.getAgentDocuments(req.params.id);
  });

  app.post(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetDocumentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return service.setAgentDocuments(req.params.id, req.body.paths);
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await app.container.skillsRepo.getById(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return service.getSkillDocuments(req.params.id);
  });

  app.post(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetDocumentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await app.container.skillsRepo.getById(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return service.setSkillDocuments(req.params.id, req.body.paths);
    },
  );
}
