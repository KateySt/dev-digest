/* Pure paging math shared by the pager and usePagedList (1-based pages). */

export const ELLIPSIS = "ellipsis" as const;
export type PageItem = number | typeof ELLIPSIS;

/** Number of pages for `total` items (at least 1, so an empty list still has page 1). */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** A page number forced into 1…pageCount; anything non-numeric becomes 1. */
export function clampPage(page: unknown, pageCount: number): number {
  const n = typeof page === "number" ? page : Number(page);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.trunc(n)), Math.max(1, pageCount));
}

/** 1-based "from–to" of the items on `page` (0–0 for an empty list). */
export function rangeOf(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(page * pageSize, total) };
}

/** After a page-size change, the page that keeps the previously first visible item on screen. */
export function pageKeepingFirstItem(page: number, oldSize: number, newSize: number): number {
  const firstIndex = (Math.max(1, page) - 1) * oldSize;
  return Math.floor(firstIndex / Math.max(1, newSize)) + 1;
}

/**
 * Page buttons to show: first and last always, `siblings` on each side of the
 * current page, gaps collapsed into an ellipsis. A gap of exactly one page is
 * shown as that page instead (an ellipsis hiding one number helps nobody), so
 * the control keeps a stable width while paging.
 *   pageItems(6, 13) → [1, "ellipsis", 5, 6, 7, "ellipsis", 13]
 */
export function pageItems(current: number, pageCount: number, siblings = 1): PageItem[] {
  if (pageCount <= 0) return [];
  const pages = new Set<number>([1, pageCount]);
  for (let p = current - siblings; p <= current + siblings; p++) if (p >= 1 && p <= pageCount) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: PageItem[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push(ELLIPSIS);
    out.push(p);
  });
  return out;
}
