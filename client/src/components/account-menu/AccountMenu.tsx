/* AccountMenu — the active user in the top bar: the GitHub account behind the
   configured token (avatar + @login), with a menu that also carries the
   desktop app's former Help-menu actions (updates, releases, logs, data). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGithubAccount } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";

export function AccountMenu() {
  const t = useTranslations("shell.account");
  const router = useRouter();
  const desktop = useDesktop();
  const { data } = useGithubAccount();
  const account = data?.account ?? null;
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (desktop) void desktop.app.getVersion().then(setVersion);
  }, [desktop]);

  const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const toSettings = () => router.push("/settings/api-keys");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={account ? t("labelWithLogin", { login: account.login }) : t("label")}
        className="app-no-drag inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface py-0.75 pr-2 pl-0.75 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {account ? (
          <UserAvatar name={account.login} avatarUrl={account.avatar_url} size={26} />
        ) : (
          <span className="grid size-6.5 place-items-center rounded-full bg-muted text-subtle-foreground">
            <Icon.User size={14} aria-hidden />
          </span>
        )}
        {account && <span className="max-w-[140px] truncate text-sm font-semibold">{account.login}</span>}
        <Icon.ChevronDown size={13} className="text-subtle-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {account ? (
          <DropdownMenuItem onSelect={() => openExternal(account.html_url)}>
            <Icon.ExternalLink aria-hidden />@{account.login}
            <DropdownMenuShortcut>{t("github")}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={toSettings}>
            <Icon.User aria-hidden />
            {t("connectGithub")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toSettings}>
          <Icon.Settings aria-hidden />
          {t("settings")}
        </DropdownMenuItem>
        {desktop && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void desktop.app.checkForUpdates()}>
              <Icon.RefreshCw aria-hidden />
              {t("checkUpdates")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void desktop.app.openReleases()}>
              <Icon.Tag aria-hidden />
              {t("releases")}
              {version && <DropdownMenuShortcut>v{version}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground" onSelect={() => void desktop.app.openLogsFolder()}>
              <Icon.Folder aria-hidden />
              {t("openLogs")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-muted-foreground" onSelect={() => void desktop.app.openDataFolder()}>
              <Icon.Folder aria-hidden />
              {t("openData")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
