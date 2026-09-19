import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';
import { CI_RUNS_LIMIT } from './constants.js';

/**
 * ci module.
 *   GET  /agents/:id/ci          → installations list (CI tab)
 *   GET  /agents/:id/ci/preview  → generated files, no side effects
 *   POST /agents/:id/ci/publish  → commit + open/reuse PR + record install
 *   GET  /ci-runs?agent_id=&repo=&status=&since= → global CI Runs page
 */

const PublishBody = z.object({ repo: z.string().min(1) });

const RunsQuery = z.object({
  agent_id: z.string().uuid().optional(),
  repo: z.string().optional(),
  status: z.string().optional(),
  since: z.string().optional(),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.get('/agents/:id/ci', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForAgent(workspaceId, req.params.id);
  });

  app.get('/agents/:id/ci/preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.preview(workspaceId, req.params.id);
  });

  app.post(
    '/agents/:id/ci/publish',
    { schema: { params: IdParams, body: PublishBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.publish(workspaceId, req.params.id, req.body.repo);
    },
  );

  app.get('/ci-runs', { schema: { querystring: RunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { agent_id, repo, status, since } = req.query;
    return service.listRuns(workspaceId, {
      ...(agent_id ? { agentId: agent_id } : {}),
      ...(repo ? { repo } : {}),
      ...(status ? { status } : {}),
      ...(since ? { since: new Date(since) } : {}),
      limit: CI_RUNS_LIMIT,
    });
  });
}
