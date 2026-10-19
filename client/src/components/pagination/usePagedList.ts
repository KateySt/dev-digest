/* usePagedList — paging state for any list, client- or server-paged
   (plan 2026-10-19, Part 2 + Part 4).
   - TanStack Table (v9, headless) owns the paging math: in client mode it
     slices `rows`; with `total` it runs `manualPagination` and the caller
     fetches the page (`page`/`pageSize` go into the query key).
   - nuqs keeps `?page=&per=` (or `?<prefix>_page=`) in the URL: shareable,
     survives reload, Back returns to the previous page.
   - The chosen page size is remembered per list in localStorage.
   Returns a `PagerState` for <DataPagination> plus the current page's rows. */
"use client";

import React from "react";
import { parseAsInteger, useQueryStates } from "nuqs";
import {
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowData,
} from "@tanstack/react-table";
import { useCommand } from "@/components/keyboard";
import { clampPage, pageKeepingFirstItem } from "./helpers";
import type { PagerState } from "./DataPagination";

/** Table lists (decided 2026-10-19): 10 / 25 / 50 / 100, default 25. */
export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;
export const TABLE_DEFAULT_PAGE_SIZE = 25;
/** Card grids: multiples of 2, 3, 4 and 6 columns. */
export const GRID_PAGE_SIZES = [12, 24, 48] as const;
export const GRID_DEFAULT_PAGE_SIZE = 24;

const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const storageKey = (listKey: string) => `dd-per-page:${listKey}`;

function readStoredSize(listKey: string): number | null {
  try {
    const v = Number(localStorage.getItem(storageKey(listKey)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function storeSize(listKey: string, size: number): void {
  try {
    localStorage.setItem(storageKey(listKey), String(size));
  } catch {
    /* private mode / blocked storage — the URL still carries it */
  }
}

export interface PagedListOptions<T extends RowData> {
  /** Stable id for this list — page-size memory, and the URL prefix when `urlPrefix` is set. */
  listKey: string;
  /** Prefix the URL keys (`cases_page`) when several paged lists share one URL. */
  urlPrefix?: string;
  pageSizes?: readonly number[];
  defaultPageSize?: number;
  /** Client mode: the whole (already filtered/sorted) list. */
  rows?: readonly T[];
  /** Server mode: the caller fetches `page`/`pageSize` (read them first with `usePageState`). */
  server?: boolean;
  /** Server mode: the total from the API (undefined while the first page loads). */
  total?: number;
  /** Server mode: the next page is loading (shown on the pager). */
  busy?: boolean;
  /** Filters/search/sort the list depends on — any change goes back to page 1. */
  resetOn?: unknown;
}

export interface PagedList<T extends RowData> extends PagerState {
  /** Client mode: the rows of the current page (empty in server mode). */
  pageRows: T[];
  /** Zero-based index of the first row on the page — handy for server queries. */
  offset: number;
}

const EMPTY: readonly never[] = [];

export interface PageStateOptions {
  listKey: string;
  urlPrefix?: string;
  pageSizes?: readonly number[];
  defaultPageSize?: number;
}

/**
 * The requested page and page size, straight from the URL (and the
 * remembered size) — no total needed. Server-paged lists call this *before*
 * their query (the query key needs page/size), then `usePagedList` after it;
 * both read the same URL keys, so they always agree.
 */
export function usePageState({
  listKey,
  urlPrefix,
  pageSizes = TABLE_PAGE_SIZES,
  defaultPageSize = TABLE_DEFAULT_PAGE_SIZE,
}: PageStateOptions) {
  const [url, setUrl] = useQueryStates(
    { page: parseAsInteger.withDefault(1), per: parseAsInteger },
    {
      urlKeys: urlPrefix ? { page: `${urlPrefix}_page`, per: `${urlPrefix}_per` } : undefined,
      clearOnDefault: true,
      scroll: false,
    },
  );

  // A remembered size applies when the URL doesn't name one (read after mount: no localStorage on the server).
  const [storedSize, setStoredSize] = React.useState<number | null>(null);
  React.useEffect(() => setStoredSize(readStoredSize(listKey)), [listKey]);

  const allowed = (n: number | null | undefined): n is number => !!n && pageSizes.includes(n);
  const pageSize = allowed(url.per) ? url.per : allowed(storedSize) ? storedSize : defaultPageSize;
  return { page: Math.max(1, url.page), pageSize, urlPage: url.page, setUrl, setStoredSize };
}

export function usePagedList<T extends RowData>(options: PagedListOptions<T>): PagedList<T> {
  const {
    listKey,
    urlPrefix,
    pageSizes = TABLE_PAGE_SIZES,
    defaultPageSize = TABLE_DEFAULT_PAGE_SIZE,
    rows,
    server = options.total !== undefined,
    total: serverTotal,
    busy,
    resetOn,
  } = options;

  const { pageSize, urlPage, setUrl, setStoredSize } = usePageState({ listKey, urlPrefix, pageSizes, defaultPageSize });
  const knownTotal = server ? serverTotal !== undefined : rows !== undefined;
  const total = server ? Math.max(0, serverTotal ?? 0) : (rows?.length ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Until the total is known, trust the URL (clamping to page 1 would fetch page 1 first, then the real one).
  const page = knownTotal ? clampPage(urlPage, pageCount) : Math.max(1, urlPage);

  const pagination: PaginationState = { pageIndex: page - 1, pageSize };
  const table = useTable({
    features,
    columns: [],
    data: (server ? EMPTY : (rows ?? EMPTY)) as T[],
    manualPagination: server,
    rowCount: server ? total : undefined,
    autoResetPageIndex: false,
    state: { pagination },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      void setUrl({ page: next.pageIndex + 1 }, { history: "push" });
    },
  });

  // A new filter/search/sort starts again at page 1 (skips the first render, so a shared URL keeps its page).
  const resetKey = JSON.stringify(resetOn ?? null);
  const lastResetKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    void setUrl({ page: null }, { history: "replace" });
  }, [resetKey, setUrl]);

  // A stale ?page= past the end (rows deleted, filter narrowed) snaps to the last page.
  React.useEffect(() => {
    if (knownTotal && urlPage !== page) void setUrl({ page }, { history: "replace" });
  }, [knownTotal, urlPage, page, setUrl]);

  const setPage = React.useCallback(
    (p: number) => table.setPageIndex(clampPage(p, pageCount) - 1),
    [table, pageCount],
  );
  const setPageSize = React.useCallback(
    (size: number) => {
      if (!pageSizes.includes(size)) return;
      storeSize(listKey, size);
      setStoredSize(size);
      // Keep the first visible item on screen instead of jumping to page 1.
      void setUrl(
        { per: size === defaultPageSize ? null : size, page: pageKeepingFirstItem(page, pageSize, size) },
        { history: "replace" },
      );
    },
    [pageSizes, listKey, setUrl, defaultPageSize, page, pageSize],
  );

  // [ / ] (rebindable): page this list while it's mounted and has more than one page.
  useCommand("list.prevPage", () => setPage(page - 1), pageCount > 1);
  useCommand("list.nextPage", () => setPage(page + 1), pageCount > 1);

  const pageRows = server ? [] : table.getRowModel().rows.map((r) => r.original as T);

  return {
    page,
    pageCount,
    pageSize,
    total,
    pageSizes,
    setPage,
    setPageSize,
    busy,
    pageRows,
    offset: (page - 1) * pageSize,
  };
}
