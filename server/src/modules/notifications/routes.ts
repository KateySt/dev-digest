import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { NotificationDto } from './helpers.js';

/**
 * Notification center.
 *   GET    /notifications            → newest first + unread count
 *   GET    /notifications/stream     → SSE: each new notification as it is created
 *   POST   /notifications/:id/read   → { read?: boolean } (false = mark unread)
 *   POST   /notifications/read-all
 *   DELETE /notifications/:id
 *   DELETE /notifications            → clear all
 */

const ReadBody = z.object({ read: z.boolean().default(true) }).default({ read: true });

/** Keep-alive comment cadence; also how fast a dead connection is noticed. */
const PING_MS = 25_000;

export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.notifications;

  app.get('/notifications', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  // One long-lived connection per open studio window — no rate limit.
  app.get('/notifications/stream', { config: { rateLimit: false } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);

    reply.sse(
      (async function* () {
        // Bridge the bus to the async iterator the SSE plugin drains. Unlike a
        // run stream this one never ends by itself, so the socket closing must
        // wake the loop up — otherwise every closed tab leaks a bus listener.
        const queue: NotificationDto[] = [];
        let wake: (() => void) | null = null;
        let closed = false;
        const unsubscribe = container.notificationBus.subscribe(workspaceId, (n) => {
          queue.push(n);
          wake?.();
        });
        const onClose = () => {
          closed = true;
          wake?.();
        };
        req.raw.once('close', onClose);
        const ping = setInterval(() => wake?.(), PING_MS);

        try {
          while (!closed) {
            if (queue.length === 0) {
              await new Promise<void>((r) => (wake = r));
              wake = null;
              if (queue.length === 0 && !closed) yield { event: 'ping', data: '{}' };
              continue;
            }
            const n = queue.shift()!;
            yield { id: n.id, event: 'notification', data: JSON.stringify(n) };
          }
        } finally {
          clearInterval(ping);
          req.raw.off('close', onClose);
          unsubscribe();
        }
      })(),
    );
  });

  app.post('/notifications/:id/read', { schema: { params: IdParams, body: ReadBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    if (!(await service.setRead(workspaceId, req.params.id, req.body.read))) {
      throw new NotFoundError('Notification not found');
    }
    return { ok: true };
  });

  app.post('/notifications/read-all', async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.markAllRead(workspaceId);
    return { ok: true };
  });

  app.delete('/notifications/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    if (!(await service.remove(workspaceId, req.params.id))) throw new NotFoundError('Notification not found');
    return { ok: true };
  });

  app.delete('/notifications', async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.clear(workspaceId);
    return { ok: true };
  });
}
