import type { Container } from '../../platform/container.js';
import { ActivityRepository } from './repository.js';

export interface ActivityDto {
  /** Review runs queued or running (multi-agent members counted individually). */
  reviews_running: number;
  /** Eval suite runs in progress. */
  evals_running: number;
}

/**
 * What is running right now, across the workspace. Polled by the desktop app
 * to drive the taskbar progress indicator and the tray status line.
 */
export class ActivityService {
  private repo: ActivityRepository;

  constructor(container: Container) {
    this.repo = new ActivityRepository(container.db);
  }

  async current(workspaceId: string): Promise<ActivityDto> {
    const [reviews_running, evals_running] = await Promise.all([
      this.repo.reviewsInFlight(workspaceId),
      this.repo.evalsRunning(workspaceId),
    ]);
    return { reviews_running, evals_running };
  }
}
