/* Settings — left sub-nav + sections. API Keys (OpenRouter + GitHub PAT, with
   Test connection), Feature Models, Catalog, Notifications and Appearance.
   Section is deep-linked at /settings/:section. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { SettingsApiKeys } from "./_components/SettingsApiKeys";
import { SettingsModels } from "./_components/SettingsModels";
import { SettingsCatalog } from "./_components/SettingsCatalog";
import { SettingsNotifications } from "./_components/SettingsNotifications";
import { SettingsAppearance } from "./_components/SettingsAppearance";
import {
  DEFAULT_SECTION,
  SECTION_API_KEYS,
  SECTION_MODELS,
  SECTION_CATALOG,
  SECTION_NOTIFICATIONS,
  SECTION_APPEARANCE,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "./constants";

export function SettingsView() {
  const t = useTranslations("settings");
  const params = useParams<{ section: string }>();
  const section = params.section ?? DEFAULT_SECTION;
  const current: SettingsSection =
    SETTINGS_SECTIONS.find((key) => key === section) ?? SETTINGS_SECTIONS[0];
  const currentLabel = t(`sections.${current}`);

  return (
    <AppShell crumb={[{ label: t("breadcrumb"), href: "/settings/api-keys" }, { label: currentLabel }]}>
      <div className="flex min-h-[calc(100vh-52px)]">
        <nav className="w-[210px] shrink-0 border-r border-border bg-surface p-4">
          <h1 className="px-2.5 pt-0.5 pb-3.5 text-lg font-bold">{t("title")}</h1>
          {SETTINGS_SECTIONS.map((key) => {
            const on = key === section;
            return (
              <Link
                key={key}
                href={`/settings/${key}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "mb-0.5 block rounded-md px-3 py-2 text-base",
                  on ? "bg-accent font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
              >
                {t(`sections.${key}`)}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 overflow-auto px-8 py-7">
          {section === SECTION_API_KEYS ? (
            <SettingsApiKeys />
          ) : section === SECTION_MODELS ? (
            <SettingsModels />
          ) : section === SECTION_CATALOG ? (
            <SettingsCatalog />
          ) : section === SECTION_NOTIFICATIONS ? (
            <SettingsNotifications />
          ) : section === SECTION_APPEARANCE ? (
            <SettingsAppearance />
          ) : (
            <EmptyState
              icon="Settings"
              title={currentLabel}
              body={t("fallbackBody", { label: currentLabel })}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
