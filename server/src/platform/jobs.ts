import PQueue from 'p-queue';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private timeoutMs: number;
  private retries: number;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;

    const done = this.queue.add(async () => {
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      try {
        await withRetry(
          () =>
            withTimeout(handler(payload, { jobId }), this.timeoutMs).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: this.retries,
            onRetry: async (attempt) => {
              await this.db
                .update(t.jobs)
                .set({ attempts: attempt })
                .where(eq(t.jobs.id, jobId));
            },
          },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: (err as Error).message,
          })
          .where(eq(t.jobs.id, jobId));
        throw err;
      }
    }) as Promise<void>;

    return { id: jobId, done };
  }

  /**
   * Boot reaper: jobs still `queued`/`running` belong to a dead process (the
   * queue is in-memory), so fail them with error `interrupted`. Without this
   * an orphan row looks "in flight" forever and dedupe-by-in-flight callers
   * (e.g. onboarding generation, S-AC-3) keep returning its stale id.
   * Call once at boot, BEFORE serving requests (nothing of this process's own
   * is in flight yet). Assumes a single API instance per DB.
   */
  async reapOrphaned(): Promise<number> {
    const rows = await this.db
      .update(t.jobs)
      .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
      .where(inArray(t.jobs.status, ['queued', 'running']))
      .returning({ id: t.jobs.id });
    return rows.length;
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
