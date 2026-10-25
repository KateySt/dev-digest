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

/** Resolves with an optional result, handed to the kind's `onDone` hook. */
export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<unknown>;

/**
 * Per-kind lifecycle hooks, called once on the job's FINAL outcome (after all
 * retries) — e.g. to post a notification. Errors thrown here are swallowed.
 */
export interface JobHooks {
  onDone?: (job: { workspaceId: string; payload: unknown; result: unknown }) => unknown;
  onFailed?: (job: { workspaceId: string; payload: unknown; error: Error }) => unknown;
}

/** Per-kind overrides of the runner-wide timeout/retries (e.g. a long LLM job). */
export interface JobKindOptions {
  timeoutMs?: number;
  retries?: number;
}

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
  private hooks = new Map<string, JobHooks>();
  private kindOptions = new Map<string, JobKindOptions>();
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

  register(kind: string, handler: JobHandler, hooks?: JobHooks, opts?: JobKindOptions): void {
    this.handlers.set(kind, handler);
    if (hooks) this.hooks.set(kind, hooks);
    else this.hooks.delete(kind);
    if (opts) this.kindOptions.set(kind, opts);
    else this.kindOptions.delete(kind);
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
      const hooks = this.hooks.get(kind);
      const kindOpts = this.kindOptions.get(kind);
      let result: unknown;
      try {
        await withRetry(
          () =>
            withTimeout(handler(payload, { jobId }), kindOpts?.timeoutMs ?? this.timeoutMs).then(async (r) => {
              result = r;
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: kindOpts?.retries ?? this.retries,
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
        await Promise.resolve(hooks?.onDone?.({ workspaceId, payload, result })).catch(() => undefined);
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: (err as Error).message,
          })
          .where(eq(t.jobs.id, jobId));
        await Promise.resolve(hooks?.onFailed?.({ workspaceId, payload, error: err as Error })).catch(() => undefined);
        throw err;
      }
    }) as Promise<void>;
    // Callers enqueue fire-and-forget; an unobserved rejection of `done` would
    // be an unhandledRejection and take the whole API process down (a failed
    // clone used to kill the desktop app's API). Mark it handled here — anyone
    // awaiting `done` still gets the rejection.
    done.catch(() => undefined);

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
  /** Returns the workspace id of every reaped job (one entry per job). */
  async reapOrphaned(): Promise<string[]> {
    const rows = await this.db
      .update(t.jobs)
      .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
      .where(inArray(t.jobs.status, ['queued', 'running']))
      .returning({ workspaceId: t.jobs.workspaceId });
    return rows.map((r) => r.workspaceId);
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
