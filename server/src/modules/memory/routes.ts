import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateMemoryBody,
  CurateMergeBody,
  CurateMergeDraftBody,
  CurateScanBody,
  MemoryListQuery,
  MergeMemoryBody,
  UpdateMemoryBody,
} from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MemoryService } from './service.js';
import { LearnService } from './learn.js';
import { CurationService } from './curation.js';

/**
 * Memory module (SPEC-2026-10-12-memory).
 *   GET    /memories                  → list (filters + facet counts + search)
 *   GET    /memories/similar          → duplicate check for the Learn modal (AC-9)
 *   GET    /memories/:id              → one memory
 *   POST   /memories                  → create (Learn Save / manual)
 *   PATCH  /memories/:id              → edit fields and/or archive
 *   DELETE /memories/:id
 *   POST   /memories/:id/merge        → fold a new Learn into an existing memory (AC-10)
 *   POST   /findings/:id/learn/draft  → LLM draft for the Learn modal; persists nothing (AC-2..6)
 *
 * Curation (SPEC-2026-10-12-memory-curation) — only ever called from the Curate click:
 *   POST   /memories/curate/scan         → dry-run proposals: duplicate groups + stale candidates
 *   POST   /memories/curate/merge-draft  → LLM merged text for a group; persists nothing
 *   POST   /memories/curate/merge        → apply ONE group merge (archives the merged-away members)
 */

const SimilarQuery = z.object({
  content: z.string().max(2000),
  repo_id: z.string().uuid().optional(),
});

export default async function memoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new MemoryService(app.container);
  const learn = new LearnService(app.container);
  const curation = new CurationService(app.container);

  app.get('/memories', { schema: { querystring: MemoryListQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.query);
  });

  app.get('/memories/similar', { schema: { querystring: SimilarQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.similar(workspaceId, req.query.content, req.query.repo_id ?? null);
  });

  app.get('/memories/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/memories', { schema: { body: CreateMemoryBody } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return service.create(workspaceId, userId, req.body);
  });

  app.patch('/memories/:id', { schema: { params: IdParams, body: UpdateMemoryBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.delete('/memories/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return reply.code(204).send();
  });

  app.post('/findings/:id/learn/draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return learn.draftFromFinding(workspaceId, userId, req.params.id);
  });

  app.post('/memories/:id/merge', { schema: { params: IdParams, body: MergeMemoryBody } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return service.merge(workspaceId, userId, req.params.id, req.body);
  });

  app.post('/memories/curate/scan', { schema: { body: CurateScanBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return curation.scan(workspaceId, req.body.repo_id ?? null);
  });

  app.post('/memories/curate/merge-draft', { schema: { body: CurateMergeDraftBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return curation.mergeDraft(workspaceId, req.body.member_ids);
  });

  app.post('/memories/curate/merge', { schema: { body: CurateMergeBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return curation.mergeGroup(workspaceId, req.body);
  });
}
