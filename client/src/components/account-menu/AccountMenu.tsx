/* AccountMenu — the active user in the top bar: the GitHub account behind the
   configured token (avatar + @login), with a menu that also carries the
   desktop app's former Help-menu actions (updates, releases, logs, data). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Dropdown, Icon, type DropdownItemDef } from "@devdigest/ui";
import { useGithubAccount } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";
import { s } from "./styles";

export function AccountMenu() {
  const router = useRouter();
  const desktop = useDesktop();
  const { data } = useGithubAccount();
  const account = data?.account ?? null;
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (desktop) void desktop.app.getVersion().then(setVersion);
  }, [desktop]);

  const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const items: DropdownItemDef[] = [
    account
      ? { label: `@${account.login}`, icon: "ExternalLink", hint: "GitHub", onClick: () => openExternal(account.html_url) }
      : { label: "Connect GitHub", icon: "User", onClick: () => router.push("/settings/api-keys") },
    { label: "Settings", icon: "Settings", onClick: () => router.push("/settings/api-keys") },
  ];
  if (desktop) {
    items.push(
      { divider: true },
      { label: "Check for updates…", icon: "RefreshCw", onClick: () => void desktop.app.checkForUpdates() },
      { label: "Releases", icon: "Tag", hint: version ? `v${version}` : undefined, onClick: () => void desktop.app.openReleases() },
      { divider: true },
      { label: "Open logs folder", icon: "Folder", muted: true, onClick: () => void desktop.app.openLogsFolder() },
      { label: "Open data folder", icon: "Folder", muted: true, onClick: () => void desktop.app.openDataFolder() },
    );
  }

  return (
    <Dropdown
      align="right"
      width={240}
      items={items}
      trigger={
        <button type="button" aria-label={account ? `Account @${account.login}` : "Account"} style={s.trigger}>
          {account ? (
            <Avatar name={account.login} avatarUrl={account.avatar_url} size={26} />
          ) : (
            <span style={s.anon}>
              <Icon.User size={14} />
            </span>
          )}
          {account && <span style={s.login}>{account.login}</span>}
          <Icon.ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
        </button>
      }
    />
  );
}
