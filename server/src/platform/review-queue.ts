/**
 * Process-wide FIFO limiter for agent runs (multi-agent review S-AC-9..12, 17).
 *
 * Custom rather than p-queue because queued jobs must report a 1-based
 * position and be removable by runId (cancel of a queued run).
 *
 * Deadlock note: every agent run enters this queue directly. Callers (bulk
 * "Review all") must NOT hold an outer slot while awaiting `enqueue`.
 */

export const DEFAULT_REVIEW_CONCURRENCY = 3;

/** Minimal logger shape (pino-compatible) so the platform layer stays framework-free. */
export interface QueueLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ReviewQueueJob {
  runId: string;
  /** Groups jobs that belong together (e.g. a multi-run id); used for logging. */
  groupKey: string;
  /** Called when the job leaves the queue and takes a slot (writes `running`). */
  onStart?: () => Promise<void> | void;
  /** The work itself. A rejection never leaks and always frees the slot. */
  run: () => Promise<void>;
}

export type ReviewQueueOutcome =
  | { status: 'completed' }
  | { status: 'failed'; error: unknown }
  | { status: 'removed' };

interface Pending {
  job: ReviewQueueJob;
  resolve: (o: ReviewQueueOutcome) => void;
}

/** Parse REVIEW_CONCURRENCY: positive integer, else fall back to 3 and flag it. */
export function parseReviewConcurrency(raw: string | undefined): { value: number; invalid: boolean } {
  if (raw === undefined || raw.trim() === '') return { value: DEFAULT_REVIEW_CONCURRENCY, invalid: false };
  const t = raw.trim();
  const n = Number(t);
  if (/^\d+$/.test(t) && Number.isSafeInteger(n) && n > 0) return { value: n, invalid: false };
  return { value: DEFAULT_REVIEW_CONCURRENCY, invalid: true };
}

export class ReviewQueue {
  private readonly waiting: Pending[] = [];
  private active = 0;
  private logger?: QueueLogger;
  private pendingWarning?: string;

  constructor(
    readonly limit: number = DEFAULT_REVIEW_CONCURRENCY,
    opts: { invalidConfig?: boolean; rawConfig?: string } = {},
  ) {
    if (opts.invalidConfig) {
      this.pendingWarning = `invalid REVIEW_CONCURRENCY ${JSON.stringify(opts.rawConfig)}; using ${limit}`;
    }
  }

  /** Attach a logger once one exists; flushes the deferred config warning. */
  setLogger(logger: QueueLogger): void {
    this.logger = logger;
    if (this.pendingWarning) {
      logger.warn({ limit: this.limit }, this.pendingWarning);
      this.pendingWarning = undefined;
    }
  }

  /** Resolves when the job finishes or is removed; never rejects. */
  enqueue(job: ReviewQueueJob): Promise<ReviewQueueOutcome> {
    return new Promise((resolve) => {
      this.waiting.push({ job, resolve });
      this.logger?.info(
        { runId: job.runId, groupKey: job.groupKey, position: this.waiting.length, active: this.active },
        'review-queue enqueue',
      );
      this.drain();
    });
  }

  /** 1-based position among queued (not running) jobs; null if not queued. */
  position(runId: string): number | null {
    const i = this.waiting.findIndex((p) => p.job.runId === runId);
    return i === -1 ? null : i + 1;
  }

  /** Remove a queued job; true if it was queued. Running jobs are unaffected. */
  remove(runId: string): boolean {
    const i = this.waiting.findIndex((p) => p.job.runId === runId);
    if (i === -1) return false;
    const [p] = this.waiting.splice(i, 1);
    this.logger?.info({ runId, groupKey: p!.job.groupKey }, 'review-queue remove');
    p!.resolve({ status: 'removed' });
    return true;
  }

  private drain(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      this.active++;
      void this.execute(next);
    }
  }

  private async execute({ job, resolve }: Pending): Promise<void> {
    let outcome: ReviewQueueOutcome = { status: 'completed' };
    this.logger?.info(
      { runId: job.runId, groupKey: job.groupKey, position: 0, active: this.active },
      'review-queue start',
    );
    try {
      await job.onStart?.();
      await job.run();
    } catch (error) {
      outcome = { status: 'failed', error };
      this.logger?.error({ runId: job.runId, groupKey: job.groupKey, err: error }, 'review-queue job failed');
    } finally {
      this.active--;
      this.logger?.info(
        { runId: job.runId, groupKey: job.groupKey, status: outcome.status, queued: this.waiting.length },
        'review-queue finish',
      );
      resolve(outcome);
      this.drain();
    }
  }
}
