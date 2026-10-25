/* Settings — left sub-nav + sections. API Keys (OpenRouter + GitHub PAT, with
   Test connection), Feature Models, Catalog, Notifications, Docs sync, Appearance,
   Keyboard, and (desktop app only) Desktop.
   Section is deep-linked at /settings/:section. */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { SettingsApiKeys } from "./_components/SettingsApiKeys";
import { SettingsModels } from "./_components/SettingsModels";
import { SettingsCatalog } from "./_components/SettingsCatalog";
import { SettingsNotifications } from "./_components/SettingsNotifications";
import { SettingsDocSync } from "./_components/SettingsDocSync";
import { SettingsAppearance } from "./_components/SettingsAppearance";
import { SettingsKeyboard } from "./_components/SettingsKeyboard";
import { SettingsDesktop } from "./_components/SettingsDesktop";
import { useDesktop } from "@/lib/desktop";
import { resolveSection, visibleSections } from "./helpers";
import {
  SECTION_API_KEYS,
  SECTION_MODELS,
  SECTION_CATALOG,
  SECTION_NOTIFICATIONS,
  SECTION_DOC_SYNC,
  SECTION_APPEARANCE,
  SECTION_KEYBOARD,
  SECTION_DESKTOP,
} from "./constants";

export function SettingsView() {
  const t = useTranslations("settings");
  const params = useParams<{ section: string }>();
  const desktop = useDesktop();
  // The Desktop section exists only inside the desktop app; in a browser its
  // URL falls back to the default section (SPEC-11 AC-39).
  const sections = visibleSections(!!desktop);
  const current = resolveSection(params.section, !!desktop);
  const section = current;
  const currentLabel = t(`sections.${current}`);

  return (
    <AppShell crumb={[{ label: t("breadcrumb"), href: "/settings/api-keys" }, { label: currentLabel }]}>
      {/* Below md the sub-nav becomes a horizontally scrollable tab row above
          the content; from md up it is the fixed left column. */}
      <div className="flex min-h-[calc(100vh-52px)] flex-col md:flex-row">
        <nav className="shrink-0 border-b border-border bg-surface px-4 pt-4 pb-2 md:w-[210px] md:border-r md:border-b-0 md:p-4">
          <h1 className="px-2.5 pt-0.5 pb-2 text-lg font-bold md:pb-3.5">{t("title")}</h1>
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:block md:px-0">
            {sections.map((key) => {
              const on = key === section;
              return (
                <Link
                  key={key}
                  href={`/settings/${key}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-base md:mb-0.5 md:whitespace-normal",
                    on ? "bg-accent font-semibold text-foreground" : "font-medium text-muted-foreground",
                  )}
                >
                  {t(`sections.${key}`)}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0 flex-1 overflow-auto px-4 py-5 md:px-8 md:py-7">
          {section === SECTION_API_KEYS ? (
            <SettingsApiKeys />
          ) : section === SECTION_MODELS ? (
            <SettingsModels />
          ) : section === SECTION_CATALOG ? (
            <SettingsCatalog />
          ) : section === SECTION_NOTIFICATIONS ? (
            <SettingsNotifications />
          ) : section === SECTION_DOC_SYNC ? (
            <SettingsDocSync />
          ) : section === SECTION_APPEARANCE ? (
            <SettingsAppearance />
          ) : section === SECTION_KEYBOARD ? (
            <SettingsKeyboard />
          ) : section === SECTION_DESKTOP ? (
            <SettingsDesktop />
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
