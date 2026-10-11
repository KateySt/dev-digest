import { EventEmitter } from 'node:events';
import type { NotificationDto } from '../modules/notifications/helpers.js';

/**
 * NotificationBus — in-memory fan-out of newly created notifications to the
 * workspace's open `GET /notifications/stream` connections. Unlike RunBus it
 * is keyed by workspace (not by run) and keeps no buffer: a client that was
 * offline catches up from the table via `GET /notifications`.
 */
export class NotificationBus {
  private emitter = new EventEmitter();

  constructor() {
    // One listener per open studio tab/window — don't warn at 10.
    this.emitter.setMaxListeners(0);
  }

  publish(workspaceId: string, notification: NotificationDto): void {
    this.emitter.emit(workspaceId, notification);
  }

  /** Returns the unsubscribe function. */
  subscribe(workspaceId: string, listener: (n: NotificationDto) => void): () => void {
    this.emitter.on(workspaceId, listener);
    return () => this.emitter.off(workspaceId, listener);
  }
}
