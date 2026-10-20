import { z } from 'zod';

/**
 * Offset paging shared by list endpoints (plan 2026-10-19, Part 2 "API shape").
 * Offset, not cursor: the studio shows numbered pages and "jump to page N",
 * and the data is local (Postgres/PGlite), so OFFSET cost is negligible.
 *
 * Opt-in: without `page` an endpoint keeps its legacy response (bare array /
 * capped list) so older clients and tests keep working.
 */
export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 100;

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface PageWindow {
  page: number;
  perPage: number;
  limit: number;
  offset: number;
}

/** The requested window, or null when the caller didn't ask for paging (legacy shape). */
export function pageWindow(q: PageQuery): PageWindow | null {
  if (q.page === undefined) return null;
  const perPage = q.per_page ?? DEFAULT_PER_PAGE;
  return { page: q.page, perPage, limit: perPage, offset: (q.page - 1) * perPage };
}

/** Paging metadata merged into a paged response. A page past the end returns no items with the real total. */
export function pageMeta(total: number, w: PageWindow): { total: number; page: number; per_page: number } {
  return { total, page: w.page, per_page: w.perPage };
}

/** `{ items, total, page, per_page }` — the shape of endpoints that used to return a bare array. */
export function paged<T>(items: T[], total: number, w: PageWindow) {
  return { items, ...pageMeta(total, w) };
}
