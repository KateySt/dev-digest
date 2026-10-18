/* Settings → Desktop (desktop app only, SPEC-11 AC-39/AC-40): window
   behaviour — close-to-tray, and the global Show/Hide shortcut, which is
   edited in Settings → Keyboard like every other shortcut. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BindingKeys, useKeyboard } from "@/components/keyboard";
import { useDesktop, useDesktopPrefs } from "@/lib/desktop";
import { PrefRow } from "../PrefRow";
import { SectionTitle } from "../SectionTitle";
import { rowAnchor } from "../SettingsKeyboard/helpers";

const WINDOW_TOGGLE = "window.toggle";

export function SettingsDesktop() {
  const t = useTranslations("settings.desktop");
  const desktop = useDesktop();
  const [prefs, setPrefs] = useDesktopPrefs();
  const { effective, globalStatus } = useKeyboard();
  const binding = effective.get(WINDOW_TOGGLE) ?? null;
  const taken = binding && globalStatus[WINDOW_TOGGLE] && globalStatus[WINDOW_TOGGLE] !== "ok";

  return (
    <div className="max-w-[640px]">
      <SectionTitle title={t("title")} body={t("body")} />
      {/* macOS already keeps the app alive in the Dock when the window closes. */}
      {desktop && desktop.platform !== "darwin" && prefs && (
        <PrefRow
          label={t("trayLabel")}
          hint={t("trayHint")}
          on={prefs.closeToTray}
          onChange={(v) => setPrefs({ closeToTray: v })}
        />
      )}
      <div className="flex items-center gap-4 border-b border-border py-3.5">
        <div className="flex-1">
          <div className="text-base font-semibold text-foreground">{t("globalLabel")}</div>
          <div className="mt-0.75 text-sm leading-[1.45] text-muted-foreground">{t("globalHint")}</div>
          {taken && <div className="mt-1 text-sm text-warn">{t("globalNotActive")}</div>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {binding ? (
            <BindingKeys binding={binding} />
          ) : (
            <span className="text-sm text-subtle-foreground">{t("globalNotSet")}</span>
          )}
          <Link href={`/settings/keyboard#${rowAnchor(WINDOW_TOGGLE)}`} className="text-sm font-semibold text-primary">
            {t("change")}
          </Link>
        </div>
      </div>
    </div>
  );
}
