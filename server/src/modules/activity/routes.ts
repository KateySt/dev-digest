import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { ActivityService, type ActivityDto } from './service.js';

/**
 * Workspace activity.
 *   GET /activity → { reviews_running, evals_running, docs_running }
 */
export default async function activityRoutes(app: FastifyInstance) {
  const { container } = app;
  const service = new ActivityService(container);

  app.get('/activity', async (req): Promise<ActivityDto> => {
    const { workspaceId } = await getContext(container, req);
    return service.current(workspaceId);
  });
}
