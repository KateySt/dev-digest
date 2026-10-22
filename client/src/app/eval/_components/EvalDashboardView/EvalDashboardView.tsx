"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageTabs } from "@/components/page-tabs";
import { AppShell } from "@/components/app-shell";
import { AgentsOverview } from "./_components/AgentsOverview";
import { SkillsOverview } from "./_components/SkillsOverview";

const TAB_KEYS = ["agents", "skills"] as const;

/** Eval Dashboard shell (`/eval?tab=agents|skills`): an Agents / Skills tab
 *  bar over the cross-agent overview (default) or the cross-skill overview.
 *  The active tab lives in the URL so it survives reloads and back/forward. */
export function EvalDashboardView() {
  const t = useTranslations("evalDashboard");
  const router = useRouter();
  const search = useSearchParams();
  const tab = search?.get("tab") === "skills" ? "skills" : "agents";

  const tabs = TAB_KEYS.map((key) => ({ key, label: t(`tabs.${key}`) }));
  const select = (key: string) => {
    const sp = new URLSearchParams(search?.toString() ?? "");
    sp.set("tab", key);
    router.replace(`/eval?${sp.toString()}`);
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-11">
        <div className="mb-5" aria-label={t("tabs.label")}>
          <PageTabs tabs={tabs} value={tab} onChange={select} />
        </div>
        {tab === "skills" ? <SkillsOverview /> : <AgentsOverview />}
      </div>
    </AppShell>
  );
}
