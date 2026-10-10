import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';
import { CI_RUNS_LIMIT, PERIOD_MS } from './constants.js';

/**
 * ci module.
 *   GET  /agents/:id/ci          → installations + recent runs (CI tab)
 *   POST /agents/:id/ci/preview  → generated files, no side effects
 *   POST /agents/:id/ci/export   → commit to devdigest/ci + open/reuse PR + record install
 *   POST /agents/:id/ci/zip      → the same file set as a zip download
 *   POST /ci-runs/sync           → pull + verify + ingest completed runs
 *   GET  /ci-runs?period=&agent_id=&repo=&status=&source= → CI Runs page
 *   GET  /ci-runs/repos          → repos with at least one installation
 */

const RunsQuery = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
  agent_id: z.string().uuid().optional(),
  repo: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.get('/agents/:id/ci', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.agentOverview(workspaceId, req.params.id);
  });

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/export',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.export(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/zip',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { filename, data } = await service.zip(workspaceId, req.params.id, req.body);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(Buffer.from(data));
    },
  );

  app.post('/ci-runs/sync', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.sync(workspaceId);
  });

  app.get('/ci-runs/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRepos(workspaceId);
  });

  app.get('/ci-runs', { schema: { querystring: RunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { period, agent_id, repo, status, source } = req.query;
    return service.listRuns(workspaceId, {
      ...(agent_id ? { agentId: agent_id } : {}),
      ...(repo ? { repo } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      since: new Date(Date.now() - PERIOD_MS[period]),
      limit: CI_RUNS_LIMIT,
    });
  });
}
