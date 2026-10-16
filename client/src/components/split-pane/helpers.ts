/** Clamp the right pane's width so neither side drops below its minimum.
 *  When the container is too narrow for both minimums, the right one wins
 *  (the detail pane is unusable below it; the list just scrolls). */
export function clampRightWidth(width: number, container: number, minLeft: number, minRight: number): number {
  const max = Math.max(minRight, container - minLeft);
  return Math.round(Math.min(max, Math.max(minRight, width)));
}

export function readStoredWidth(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function storeWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    /* ignore — private mode / blocked storage */
  }
}
