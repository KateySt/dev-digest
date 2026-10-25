import { powerSaveBlocker } from 'electron';
import log from 'electron-log/main';
import { onActivity } from './activity';

let blockerId: number | null = null;

/**
 * While a Docs Sync run is in progress (the nightly docs check), keep the
 * system from suspending so a run that started at night isn't frozen halfway
 * through a GitHub push. `prevent-app-suspension` lets the screen turn off;
 * the blocker is released the moment the run ends. It never wakes a machine
 * that is already asleep — the schedule only fires while DevDigest is running.
 */
export function keepAwakeWhileDocSync(): void {
  onActivity(({ keepAwake }) => {
    if (keepAwake && blockerId === null) {
      blockerId = powerSaveBlocker.start('prevent-app-suspension');
      log.info('docs sync running — system sleep blocked');
    } else if (!keepAwake && blockerId !== null) {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
      blockerId = null;
      log.info('docs sync finished — system sleep allowed');
    }
  });
}
