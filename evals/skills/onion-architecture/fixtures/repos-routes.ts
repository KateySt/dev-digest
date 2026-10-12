// server/src/modules/repos/routes.ts
import type { FastifyInstance } from 'fastify';
import { getContext } from '../../platform/context.js';

export async function repoRoutes(app: FastifyInstance) {
  app.get('/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return app.container.repoService.list(workspaceId);
  });

  app.post('/repos/:id/sync', async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as { id: string };
    await app.container.repoService.requestSync(workspaceId, id);
    return reply.code(202).send({ status: 'queued' });
  });
}
