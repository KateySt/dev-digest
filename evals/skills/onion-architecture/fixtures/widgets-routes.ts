// server/src/modules/widgets/routes.ts
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { widgets } from '../../db/schema.js';
import { getContext } from '../../platform/context.js';

export async function widgetRoutes(app: FastifyInstance) {
  app.get('/widgets/ranked', async (req) => {
    const { workspaceId } = await getContext(app.container, req);

    const rows = await app.container.db
      .select()
      .from(widgets)
      .where(and(eq(widgets.workspaceId, workspaceId), eq(widgets.archived, false)))
      .orderBy(desc(widgets.createdAt));

    // ranking rule: stale widgets are demoted, popular ones are boosted
    const now = Date.now();
    const ranked = rows
      .map((w) => {
        const ageDays = (now - w.createdAt.getTime()) / 86_400_000;
        const score = w.uses * 2 - ageDays * 0.5 + (w.pinned ? 100 : 0);
        return { ...w, score };
      })
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, 20);
  });
}
