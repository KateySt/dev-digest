/* Settings → Notifications: OS notifications (desktop app) and their sound.
   Stored as non-secret prefs; the in-app bell always works regardless. */
"use client";

import { useTranslations } from "next-intl";
import { NOTIFICATION_PREF_KEYS, notificationPrefs, useSettings, useUpdateSettings } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";
import { PrefRow } from "../PrefRow";
import { SectionTitle } from "../SectionTitle";

export function SettingsNotifications() {
  const t = useTranslations("settings.notifications");
  const { data: settings } = useSettings();
  const { mutate } = useUpdateSettings();
  const desktop = useDesktop();
  const prefs = notificationPrefs(settings);

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
      {!desktop && <p className="mt-4 text-ui text-subtle-foreground">{t("browserNote")}</p>}
    </div>
  );
}
