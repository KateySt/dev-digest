"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Tabs } from "@devdigest/ui";
import { FileImportTab } from "./_components/FileImportTab";
import { UrlImportTab } from "./_components/UrlImportTab";
import { CommunityImportTab } from "./_components/CommunityImportTab";
import { s } from "./styles";

const TABS = [
  { key: "file", label: "From file" },
  { key: "url", label: "From URL" },
  { key: "community", label: "Community" },
];

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
  initialTab?: "file" | "url" | "community";
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<"file" | "url" | "community">(initialTab);
  const tabs = TABS.map((tb) => ({ ...tb, label: t(`drawer.tabs.${tb.key}`) }));

  return (
    <Drawer title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <div style={s.tabsWrap}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} pad="0" />
      </div>
      <div style={s.body}>
        {tab === "file" && <FileImportTab onClose={onClose} />}
        {tab === "url" && <UrlImportTab onClose={onClose} />}
        {tab === "community" && <CommunityImportTab />}
      </div>
    </Drawer>
  );
}
