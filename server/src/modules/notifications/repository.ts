import { and, count, desc, eq, isNull, lt, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewNotification, NotificationRow } from './helpers.js';

/** Data access for `notifications`. Every query is scoped by workspaceId. */
export class NotificationsRepository {
  constructor(private db: Db) {}

  async insert(workspaceId: string, n: NewNotification): Promise<NotificationRow> {
    const [row] = await this.db
      .insert(t.notifications)
      .values({ workspaceId, kind: n.kind, status: n.status, title: n.title, body: n.body ?? null, href: n.href ?? null })
      .returning();
    return row!;
  }

  list(workspaceId: string, limit: number): Promise<NotificationRow[]> {
    return this.db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.workspaceId, workspaceId))
      .orderBy(desc(t.notifications.createdAt))
      .limit(limit);
  }

  async unreadCount(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.notifications)
      .where(and(eq(t.notifications.workspaceId, workspaceId), isNull(t.notifications.readAt)));
    return row?.n ?? 0;
  }

  /** `read: false` marks it unread again. Returns whether a row matched. */
  async setRead(workspaceId: string, id: string, read: boolean): Promise<boolean> {
    const rows = await this.db
      .update(t.notifications)
      .set({ readAt: read ? new Date() : null })
      .where(and(eq(t.notifications.workspaceId, workspaceId), eq(t.notifications.id, id)))
      .returning({ id: t.notifications.id });
    return rows.length > 0;
  }

  async markAllRead(workspaceId: string): Promise<void> {
    await this.db
      .update(t.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(t.notifications.workspaceId, workspaceId), isNull(t.notifications.readAt)));
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.notifications)
      .where(and(eq(t.notifications.workspaceId, workspaceId), eq(t.notifications.id, id)))
      .returning({ id: t.notifications.id });
    return rows.length > 0;
  }

  async clear(workspaceId: string): Promise<void> {
    await this.db.delete(t.notifications).where(eq(t.notifications.workspaceId, workspaceId));
  }

  /** Drop rows past the retention window: older than `before`, or beyond the newest `keep`. */
  async prune(workspaceId: string, keep: number, before: Date): Promise<void> {
    const ws = eq(t.notifications.workspaceId, workspaceId);
    await this.db.delete(t.notifications).where(and(ws, lt(t.notifications.createdAt, before)));
    const newest = await this.db
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(ws)
      .orderBy(desc(t.notifications.createdAt))
      .limit(keep);
    if (newest.length < keep) return;
    await this.db.delete(t.notifications).where(and(ws, notInArray(t.notifications.id, newest.map((r) => r.id))));
  }
}
