"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BindingKeys, useKeyboard } from "@/components/keyboard";
import { cn } from "@/lib/utils";
import type { Crumb, ShellContext } from "./types";

/** Top bar: breadcrumb, command-palette search, theme toggle, notifications,
 *  account, and (desktop app) window controls. Doubles as the window drag area. */
/** The palette's effective shortcut (⌘K / Ctrl+K, or the user's own; hidden when unbound). */
function PaletteHint() {
  const { activeBinding } = useKeyboard();
  const binding = activeBinding("palette.open");
  return binding ? <BindingKeys binding={binding} /> : null;
}

export function Topbar({ ctx, crumb = [] }: { ctx: ShellContext; crumb?: Crumb[] }) {
  const t = useTranslations("shell.topbar");
  const themeLabel = t("toggleTheme");
  return (
    <header
      className={cn(
        // Container: below ~820px of bar width (expanded sidebar in the
        // 1024px window) the search collapses to an icon button.
        "app-drag @container/topbar flex h-13 shrink-0 items-center gap-4 border-b border-border bg-background",
        // Window controls sit flush against the right edge, full height.
        ctx.windowControls ? "pl-6" : "px-6",
      )}
    >
      <nav aria-label={t("breadcrumb")} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-2">
          {crumb.map((c, i) => {
            const last = i === crumb.length - 1;
            // An empty label is still loading (e.g. the repo name) — never show a raw id.
            const text = !c.label ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span
                className={cn(
                  "block truncate text-base whitespace-nowrap",
                  c.mono && "mono",
                  last ? "font-semibold text-foreground" : "max-w-60 font-medium text-muted-foreground",
                )}
                title={c.label}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            );
            return (
              <li key={i} className={cn("flex min-w-0 items-center gap-2", !last && "shrink-0")}>
                {i > 0 && <Icon.ChevronRight size={13} className="shrink-0 text-subtle-foreground" aria-hidden />}
                {c.href ? <Link href={c.href}>{text}</Link> : text}
              </li>
            );
          })}
        </ol>
      </nav>
      <button
        type="button"
        onClick={ctx.onOpenCommandPalette}
        aria-label={t("search")}
        title={t("search")}
        className="ml-auto flex size-9 shrink-0 items-center justify-center gap-2.5 rounded-[7px] border border-border bg-surface text-sm text-subtle-foreground transition-colors hover:border-border-strong @min-[820px]/topbar:h-auto @min-[820px]/topbar:w-[260px] @min-[820px]/topbar:justify-start @min-[820px]/topbar:px-3.5 @min-[820px]/topbar:py-2"
      >
        <Icon.Search size={15} className="@min-[820px]/topbar:hidden" aria-hidden />
        <span className="hidden flex-1 text-left @min-[820px]/topbar:block">{t("search")}</span>
        <span className="hidden @min-[820px]/topbar:contents">
          <PaletteHint />
        </span>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label={themeLabel} title={themeLabel} onClick={ctx.onToggleTheme}>
        {ctx.theme === "light" ? <Icon.Moon /> : <Icon.Sun />}
      </Button>
      {ctx.notifications}
      {ctx.account}
      {ctx.windowControls}
    </header>
  );
}
