"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NAV, SETTINGS_ITEM, resolveHref, type NavItemDef } from "./nav";
import { RepoSwitcher } from "./RepoSwitcher";
import type { ShellContext } from "./types";

function NavLink({ item, ctx, badge }: { item: NavItemDef; ctx: ShellContext; badge?: number }) {
  const t = useTranslations("shell.nav");
  const I = Icon[item.icon];
  const active = ctx.activeKey === item.key;
  return (
    <SidebarMenuItem>
      {/* Accent bar just outside the active button (which clips its own overflow). */}
      {active && <span aria-hidden className="absolute inset-y-1.75 -left-2 w-0.5 rounded-xs bg-primary" />}
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "relative h-auto gap-3 px-3.5 py-2.5 text-base font-medium text-muted-foreground transition-colors",
          "hover:bg-elevated hover:text-foreground",
          "data-[active=true]:bg-accent data-[active=true]:font-semibold data-[active=true]:text-foreground",
          "data-[active=true]:[&>svg]:text-primary",
        )}
      >
        <Link href={resolveHref(item.href, ctx.repoId)}>
          <I size={16} aria-hidden />
          <span className="flex-1">{t(item.key)}</span>
        </Link>
      </SidebarMenuButton>
      {badge != null && (
        <SidebarMenuBadge className="tnum top-1/2 right-3 -translate-y-1/2 rounded-full border border-border bg-surface px-2 text-xs font-semibold text-subtle-foreground">
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ctx }: { ctx: ShellContext }) {
  const t = useTranslations("shell");
  return (
    <Sidebar
      collapsible="none"
      className={cn(
        "h-auto min-h-svh shrink-0 gap-0.5 overflow-hidden border-r border-sidebar-border px-3.5 pb-4",
        // Desktop app: the logo row sits on the title bar's line.
        ctx.desktop || ctx.macTrafficLights ? "pt-2.75" : "pt-6",
      )}
    >
      {/* The logo row doubles as a window drag handle in the desktop app;
          on macOS it keeps 64px clear for the traffic lights. */}
      <SidebarHeader className={cn("app-drag gap-0.5 p-0", ctx.macTrafficLights && "pl-16")}>
        <Link href="/" className="inline-flex items-center gap-2.5 px-1.25 pt-0.5 pb-3.5">
          <span className="grid size-6.5 shrink-0 place-items-center rounded-[7px] bg-foreground">
            <Icon.Layers size={15} className="text-background" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-[-0.02em]">{t("brand")}</span>
        </Link>
        <RepoSwitcher ctx={ctx} />
      </SidebarHeader>
      <SidebarContent className="-mx-1.25 mt-1.25 gap-0 px-1.25">
        {NAV.map((grp) => (
          <SidebarGroup key={grp.section} className="mb-4 p-0">
            <SidebarGroupLabel className="mb-2 h-auto px-3.5 text-xs font-bold tracking-[0.08em] text-subtle-foreground uppercase">
              {t(`navSection.${grp.section}`)}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0">
              {grp.items.map((it) => (
                <NavLink key={it.key} item={it} ctx={ctx} badge={it.key === "pulls" ? ctx.prCount : undefined} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="mt-0.5 border-t border-sidebar-border p-0 pt-2.5">
        <SidebarMenu>
          <NavLink item={SETTINGS_ITEM} ctx={ctx} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
