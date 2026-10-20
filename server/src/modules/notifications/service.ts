import type { Container } from '../../platform/container.js';
import { NotificationsRepository } from './repository.js';
import { LIST_LIMIT, MAX_AGE_DAYS, MAX_NOTIFICATIONS } from './constants.js';
import { toNotificationDto, type NewNotification, type NotificationDto } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Notification center. `notify()` is the single entry point every producer
 * (reviews, evals, clone/index/onboarding jobs, boot reapers) calls when a
 * long-running operation reaches a terminal state: it stores the row, prunes
 * the workspace past retention, and pushes it to open SSE streams.
 */
export class NotificationsService {
  private repo: NotificationsRepository;

  constructor(private container: Container) {
    this.repo = new NotificationsRepository(container.db);
  }

  /**
   * Never throws: a notification is a side effect, and failing to record one
   * must not fail (or un-finish) the operation that triggered it. Resolves to
   * null when it could not be stored, or when `input` is null (nothing to say).
   */
  async notify(workspaceId: string, input: NewNotification | null): Promise<NotificationDto | null> {
    if (!input) return null;
    try {
      const dto = toNotificationDto(await this.repo.insert(workspaceId, input));
      this.container.notificationBus.publish(workspaceId, dto);
      await this.repo.prune(workspaceId, MAX_NOTIFICATIONS, new Date(Date.now() - MAX_AGE_DAYS * DAY_MS));
      return dto;
    } catch {
      return null;
    }
  }

  /**
   * Newest first. With `limit` (the popover's "Load more" window) the response
   * also carries `total`; without it, the legacy shape and LIST_LIMIT.
   */
  async list(
    workspaceId: string,
    limit?: number,
  ): Promise<{ items: NotificationDto[]; unread: number; total?: number }> {
    const [rows, unread, total] = await Promise.all([
      this.repo.list(workspaceId, limit ?? LIST_LIMIT),
      this.repo.unreadCount(workspaceId),
      limit === undefined ? Promise.resolve(undefined) : this.repo.totalCount(workspaceId),
    ]);
    const items = rows.map(toNotificationDto);
    return total === undefined ? { items, unread } : { items, unread, total };
  }

  setRead(workspaceId: string, id: string, read: boolean): Promise<boolean> {
    return this.repo.setRead(workspaceId, id, read);
  }

  markAllRead(workspaceId: string): Promise<void> {
    return this.repo.markAllRead(workspaceId);
  }

  remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.remove(workspaceId, id);
  }

  clear(workspaceId: string): Promise<void> {
    return this.repo.clear(workspaceId);
  }
}
