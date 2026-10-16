"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PageTabs } from "@/components/page-tabs";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FileImportTab } from "./_components/FileImportTab";
import { UrlImportTab } from "./_components/UrlImportTab";
import { CommunityImportTab } from "./_components/CommunityImportTab";

const TABS = ["file", "url", "community"] as const;
type AddTab = (typeof TABS)[number];

/**
 * Add Skill drawer — three tabs over three independent import paths. Kept
 * thin (tab switch only); each tab's logic lives in its own `_components/`
 * folder (the 200-line ceiling is why the old single-file Community tab was
 * extracted — see dev plan SPEC-07 step 16).
 */
export function AddSkillDrawer({
  onClose,
  initialTab = "file",
}: {
  onClose: () => void;
  initialTab?: AddTab;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<AddTab>(initialTab);
  const tabs = TABS.map((key) => ({ key, label: t(`drawer.tabs.${key}`) }));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[720px] sm:max-w-[94%]">
        <SheetHeader>
          <SheetTitle>{t("drawer.title")}</SheetTitle>
          <SheetDescription>{t("drawer.subtitle")}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <PageTabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddTab)} className="mb-5" />
          <div className="flex flex-col">
            {tab === "file" && <FileImportTab onClose={onClose} />}
            {tab === "url" && <UrlImportTab onClose={onClose} />}
            {tab === "community" && <CommunityImportTab />}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
