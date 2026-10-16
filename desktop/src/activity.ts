/**
 * What the studio last reported as running + unread (via app:set-activity).
 * The taskbar and tray subscribe and render it; main never polls the API itself.
 */
export interface Activity {
  running: number;
  unread: number;
}

let current: Activity = { running: 0, unread: 0 };
const listeners = new Set<(a: Activity) => void>();

export function getActivity(): Activity {
  return current;
}

export function setActivity(next: Activity): void {
  if (next.running === current.running && next.unread === current.unread) return;
  current = next;
  for (const fn of listeners) fn(current);
}

/** Called right away with the current value; returns the unsubscribe function. */
export function onActivity(fn: (a: Activity) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
