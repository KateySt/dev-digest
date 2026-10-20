/* DataPagination — the one pager for every paged list (plan 2026-10-19, Part 2).
   "Showing 26–50 of 312" + rows per page + « ‹ 1 … 5 [6] 7 … 13 › » + a
   "Page [6] of 13" jump field. It adapts to its own container's width
   (Tailwind container queries), not the window: full ≥ 640px, compact
   "‹ Page [6] of 13 ›" below that, and "‹ 6 / 13 ›" under 380px. Renders
   nothing when everything fits on the smallest page size. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { ELLIPSIS, clampPage, pageItems, rangeOf } from "./helpers";

/** What the pager needs — `usePagedList` returns exactly this. */
export interface PagerState {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  pageSizes: readonly number[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** A server page is loading while the previous one stays visible. */
  busy?: boolean;
}

/** "Page [6] of 13" — Enter/blur jumps (clamped), Esc reverts, ↑/↓ step. */
function PageJump({
  pager,
  inputRef,
  className,
  ...rest
}: {
  pager: PagerState;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  "data-variant"?: string;
}) {
  const t = useTranslations("common.pagination");
  const [draft, setDraft] = React.useState(String(pager.page));
  React.useEffect(() => setDraft(String(pager.page)), [pager.page]);

  const commit = () => {
    const next = clampPage(draft, pager.pageCount);
    setDraft(String(next));
    if (next !== pager.page) pager.setPage(next);
  };

  return (
    <span {...rest} className={cn("flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground", className)}>
      {t("page")}
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={1}
        max={pager.pageCount}
        value={draft}
        aria-label={t("pageNumber")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(String(pager.page));
          }
        }}
        className="h-8 w-14 rounded-md border border-border bg-surface px-1.5 text-center text-sm text-foreground [appearance:textfield] focus-visible:border-primary focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {t("of", { count: pager.pageCount })}
    </span>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export function DataPagination({ pager, className }: { pager: PagerState; className?: string }) {
  const t = useTranslations("common.pagination");
  const { page, pageCount, pageSize, total, pageSizes, setPage, setPageSize, busy } = pager;
  const jumpRef = React.useRef<HTMLInputElement>(null);
  const [editingTiny, setEditingTiny] = React.useState(false);

  if (total <= (pageSizes[0] ?? pageSize)) return null;

  const { from, to } = rangeOf(page, pageSize, total);
  const atStart = page <= 1;
  const atEnd = page >= pageCount;
  const go = (p: number) => setPage(clampPage(p, pageCount));
  const sizeOptions = pageSizes.map((n) => ({ value: String(n), label: String(n) }));

  return (
    <div className={cn("@container w-full", className)} aria-busy={busy || undefined}>
      <Pagination aria-label={t("nav")} className="mx-0 w-full flex-col gap-2.5">
        {/* Summary + rows per page (compact and up) */}
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span aria-live="polite" className="text-sm text-muted-foreground">
            <span className="hidden @min-[640px]:inline">{t("showing", { from, to, total })}</span>
            <span className="@min-[640px]:hidden">{t("items", { total })}</span>
          </span>
          <label className="hidden items-center gap-2 text-sm text-muted-foreground @min-[380px]:flex">
            <span className="hidden @min-[640px]:inline">{t("rowsPerPage")}</span>
            <span className="w-[72px]">
              <SelectField
                value={String(pageSize)}
                onChange={(v) => setPageSize(Number(v))}
                options={sizeOptions}
                mono={false}
                ariaLabel={t("rowsPerPage")}
              />
            </span>
          </label>
        </div>

        <div className={cn("flex w-full items-center justify-between gap-3", busy && "opacity-70")}>
          {/* Full: « ‹ 1 … 5 [6] 7 … 13 › » */}
          <PaginationContent data-variant="full" className="hidden gap-1 @min-[640px]:flex">
            <PaginationItem>
              <NavButton label={t("first")} disabled={atStart} onClick={() => go(1)}>
                <Icon.ChevronsLeft aria-hidden />
              </NavButton>
            </PaginationItem>
            <PaginationItem>
              <NavButton label={t("previous")} disabled={atStart} onClick={() => go(page - 1)}>
                <Icon.ChevronLeft aria-hidden />
              </NavButton>
            </PaginationItem>
            {pageItems(page, pageCount).map((item, i) =>
              item === ELLIPSIS ? (
                <PaginationItem key={`gap-${i}`}>
                  {/* The hidden range is one click away: focus the jump field. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("jump")}
                    onClick={() => {
                      jumpRef.current?.focus();
                      jumpRef.current?.select();
                    }}
                  >
                    …
                  </Button>
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <Button
                    variant={item === page ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={t("goToPage", { page: item })}
                    aria-current={item === page ? "page" : undefined}
                    className={cn("min-w-8 px-1.5 tabular-nums", item === page && "border-primary text-foreground")}
                    onClick={() => go(item)}
                  >
                    {item}
                  </Button>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <NavButton label={t("next")} disabled={atEnd} onClick={() => go(page + 1)}>
                <Icon.ChevronRight aria-hidden />
              </NavButton>
            </PaginationItem>
            <PaginationItem>
              <NavButton label={t("last")} disabled={atEnd} onClick={() => go(pageCount)}>
                <Icon.ChevronsRight aria-hidden />
              </NavButton>
            </PaginationItem>
          </PaginationContent>
          <PageJump pager={pager} inputRef={jumpRef} className="hidden @min-[640px]:flex" data-variant="full" />

          {/* Compact: ‹ Page [6] of 13 › */}
          <div data-variant="compact" className="hidden w-full items-center justify-center gap-2 @min-[380px]:flex @min-[640px]:hidden">
            <NavButton label={t("previous")} disabled={atStart} onClick={() => go(page - 1)}>
              <Icon.ChevronLeft aria-hidden />
            </NavButton>
            <PageJump pager={pager} />
            <NavButton label={t("next")} disabled={atEnd} onClick={() => go(page + 1)}>
              <Icon.ChevronRight aria-hidden />
            </NavButton>
          </div>

          {/* Tiny: ‹ 6 / 13 › — the counter turns into the field when clicked */}
          <div data-variant="tiny" className="flex w-full items-center justify-center gap-2 @min-[380px]:hidden">
            <NavButton label={t("previous")} disabled={atStart} onClick={() => go(page - 1)}>
              <Icon.ChevronLeft aria-hidden />
            </NavButton>
            {editingTiny ? (
              <PageJump pager={pager} />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="tabular-nums"
                aria-label={t("jump")}
                onClick={() => setEditingTiny(true)}
              >
                {page} / {pageCount}
              </Button>
            )}
            <NavButton label={t("next")} disabled={atEnd} onClick={() => go(page + 1)}>
              <Icon.ChevronRight aria-hidden />
            </NavButton>
          </div>
        </div>
      </Pagination>
    </div>
  );
}
