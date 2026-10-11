/** Compact relative age ("just now", "5m ago", "3h ago", "2d ago") for an ISO
 *  timestamp; null when missing or unparseable. Used where an age sits inside a
 *  sentence or a list row (onboarding tour footer, notification center). */
export function formatRelativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
