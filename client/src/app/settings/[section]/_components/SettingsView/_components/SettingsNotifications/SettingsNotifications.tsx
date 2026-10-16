/* Settings → Notifications: OS notifications (desktop app), their sound, and
   whether closing the window keeps DevDigest running in the tray.
   Stored as non-secret prefs; the in-app bell always works regardless. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NOTIFICATION_PREF_KEYS, notificationPrefs, useSettings, useUpdateSettings } from "@/lib/hooks";
import { useDesktop, useDesktopPrefs } from "@/lib/desktop";
import { SectionTitle } from "../SectionTitle";

function PrefRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    // A <label> names the switch button inside it and makes the whole row clickable.
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 border-b border-border py-3.5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex-1">
        <div className="text-base font-semibold text-foreground">{label}</div>
        <div className="mt-0.75 text-sm leading-[1.45] text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function SettingsNotifications() {
  const t = useTranslations("settings.notifications");
  const { data: settings } = useSettings();
  const { mutate } = useUpdateSettings();
  const desktop = useDesktop();
  const [desktopPrefs, setDesktopPrefs] = useDesktopPrefs();
  const prefs = notificationPrefs(settings);
  // macOS already keeps the app alive in the Dock when the window closes.
  const showTrayRow = !!desktop && desktop.platform !== "darwin";

  return (
    <div className="max-w-[640px]">
      <SectionTitle title={t("title")} body={t("body")} />
      <PrefRow
        label={t("desktopLabel")}
        hint={t("desktopHint")}
        on={prefs.desktop}
        onChange={(v) => mutate({ [NOTIFICATION_PREF_KEYS.desktop]: v })}
      />
      <PrefRow
        label={t("soundLabel")}
        hint={t("soundHint")}
        on={prefs.sound}
        disabled={!prefs.desktop}
        onChange={(v) => mutate({ [NOTIFICATION_PREF_KEYS.sound]: v })}
      />
      {showTrayRow && desktopPrefs && (
        <PrefRow
          label={t("trayLabel")}
          hint={t("trayHint")}
          on={desktopPrefs.closeToTray}
          onChange={(v) => setDesktopPrefs({ closeToTray: v })}
        />
      )}
      {!desktop && <p className="mt-4 text-ui text-subtle-foreground">{t("browserNote")}</p>}
    </div>
  );
}
