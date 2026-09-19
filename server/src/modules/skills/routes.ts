import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * A1 — skills module (owner A1).
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual create, or client-side
 *                                      file import — same endpoint)
 *   PUT    /skills/:id              → update (body change bumps version)
 *   DELETE /skills/:id              → delete
 *   POST   /skills/import-url       → server-side fetch, stored disabled
 *   GET    /skills/community        → search the fixture catalog
 *   POST   /skills/import-community → import a fixture catalog entry, disabled
 */

const CreateSkillBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']).optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const ImportUrlBody = z.object({ url: z.string().min(1) });

const CommunityQuery = z.object({ q: z.string().optional(), lang: z.string().optional() });

const ImportCommunityBody = z.object({ name: z.string().min(1) });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post('/skills/import-url', { schema: { body: ImportUrlBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.importFromUrl(workspaceId, req.body.url);
    reply.status(201);
    return skill;
  });

  app.get('/skills/community', { schema: { querystring: CommunityQuery } }, async (req) => {
    await getContext(app.container, req);
    return service.searchCommunity(req.query.q, req.query.lang);
  });

  app.post(
    '/skills/import-community',
    { schema: { body: ImportCommunityBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.importCommunity(workspaceId, req.body.name);
      reply.status(201);
      return skill;
    },
  );
}
