import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * A1 — skills module (owner A1).
 *   GET    /skills                  → list (workspace-scoped; optional
 *                                      ?repo_id= project filter, 2026-10-02
 *                                      amendment — omitted ⇒ unfiltered
 *                                      default, 'none' ⇒ global-only, a repo
 *                                      id ⇒ that project + global)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual create, or client-side
 *                                      file import — same endpoint; optional
 *                                      repo_id for project scope, SPEC-07)
 *   PUT    /skills/:id              → update (body change bumps version;
 *                                      optional repo_id reassigns project
 *                                      scope without bumping version, 2026-
 *                                      10-02 amendment)
 *   DELETE /skills/:id              → delete
 *   POST   /skills/import-url       → server-side fetch, stored disabled
 *   GET    /skills/community        → live catalog listing (SPEC-07), q + tag filter
 *   POST   /skills/community/refresh → discard the cached listing, re-fetch
 *   POST   /skills/import-community → import a catalog entry by path, disabled
 *   GET    /skills/:id/versions             → version history (Versions tab)
 *   POST   /skills/:id/versions/:version/restore → restore a past body as a new version
 *   GET    /skills/:id/stats                → Stats tab aggregate
 *   POST   /skills/:id/scan                 → re-run the content-malware scan
 */

const CreateSkillBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']).optional(),
  enabled: z.boolean().optional(),
  // SPEC-07 — optional project scope; absent ⇒ global (AC-23).
  repo_id: z.string().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  override: z.boolean().optional(),
  // 2026-10-02 amendment — project scope reassignment (AC-41/AC-43).
  // Omitted ⇒ not touched; null ⇒ cleared to global; a string ⇒ reassigned.
  repo_id: z.string().nullable().optional(),
});

// 2026-10-02 amendment — AC-35/AC-36/AC-37: omitted ⇒ workspace-wide
// (unchanged default); the reserved literal 'none' ⇒ global-only; any other
// value ⇒ that project's skills plus every global skill.
const ListSkillsQuery = z.object({ repo_id: z.string().optional() });

const ImportUrlBody = z.object({ url: z.string().min(1) });

const CommunityQuery = z.object({ q: z.string().optional(), tag: z.string().optional() });

const ImportCommunityBody = z.object({ path: z.string().min(1), repo_id: z.string().min(1) });

const VersionParams = z.object({ id: z.string(), version: z.coerce.number().int() });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.skillsService;

  app.get('/skills', { schema: { querystring: ListSkillsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.query.repo_id);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { repo_id, ...rest } = req.body;
    const skill = await service.create(workspaceId, { ...rest, repoId: repo_id });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { repo_id, ...rest } = req.body;
    const skill = await service.update(workspaceId, req.params.id, {
      ...rest,
      ...(repo_id !== undefined ? { repoId: repo_id } : {}),
    });
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
    const { workspaceId } = await getContext(app.container, req);
    return service.communityCatalogListing(workspaceId, { query: req.query.q, tag: req.query.tag });
  });

  app.post(
    '/skills/community/refresh',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.communityCatalogListing(workspaceId, { forceRefresh: true });
    },
  );

  app.post(
    '/skills/import-community',
    { schema: { body: ImportCommunityBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.importCommunitySkill(workspaceId, req.body.path, req.body.repo_id);
      reply.status(201);
      return skill;
    },
  );

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restoreVersion(workspaceId, req.params.id, req.params.version);
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.stats(workspaceId, req.params.id);
  });

  app.post('/skills/:id/scan', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.scanSkill(workspaceId, req.params.id);
  });
}
