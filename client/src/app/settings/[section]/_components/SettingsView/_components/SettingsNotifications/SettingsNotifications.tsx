/* Settings → Notifications: OS notifications (desktop app) and their sound.
   Stored as non-secret prefs; the in-app bell always works regardless. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import { NOTIFICATION_PREF_KEYS, notificationPrefs, useSettings, useUpdateSettings } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

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
    <label style={{ ...s.row, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : undefined }}>
      <div style={s.text}>
        <div style={s.label}>{label}</div>
        <div style={s.hint}>{hint}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </label>
  );
}

export function SettingsNotifications() {
  const t = useTranslations("settings.notifications");
  const { data: settings } = useSettings();
  const { mutate } = useUpdateSettings();
  const desktop = useDesktop();
  const prefs = notificationPrefs(settings);

  return (
    <div style={s.wrap}>
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
      {!desktop && <p style={s.note}>{t("browserNote")}</p>}
    </div>
  );
}
