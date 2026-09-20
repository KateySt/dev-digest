"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { VALID_SKILL_TABS } from "./_components/SkillEditor/constants";
import { AddSkillDrawer } from "./_components/AddSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [addingTab, setAddingTab] = React.useState<"file" | "url" | "community" | null>(null);
  const [query, setQuery] = React.useState("");

  const selected = search.get("skill");
  const tab = VALID_SKILL_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";

  const selectSkill = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("skill", id);
    else sp.delete("skill");
    router.replace(`/skills?${sp.toString()}`);
  };
  const setTab = (tabKey: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tabKey);
    router.replace(`/skills?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], query);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {addingTab && <AddSkillDrawer initialTab={addingTab} onClose={() => setAddingTab(null)} />}
      <div style={s.page}>
        <div style={s.left}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setAddingTab("file") },
                { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => setAddingTab("url") },
                { label: t("page.menu.community"), icon: "Search", onClick: () => setAddingTab("community") },
              ]}
            />
          </div>

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={120} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </div>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && list.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setAddingTab("file")}
            />
          )}
          {list.length > 0 && (
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selected}
                  onClick={() => selectSkill(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              ))}
            </div>
          )}
        </div>

        <div style={s.right}>
          {selected ? (
            <SkillEditor skillId={selected} tab={tab} onTab={setTab} onClosed={() => selectSkill(null)} />
          ) : (
            <div style={s.selectPrompt}>
              <Icon.Sparkles size={22} />
              <div style={s.selectPromptTitle}>{t("page.selectPrompt.title")}</div>
              <div style={s.selectPromptBody}>{t("page.selectPrompt.body")}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
