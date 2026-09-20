"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer, ErrorState, FormField, Icon, Select, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import {
  useCommunitySkills,
  useCreateSkill,
  useImportCommunitySkill,
  useImportSkillUrl,
} from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPES } from "../../constants";
import { nameFromMarkdown } from "./helpers";
import { s } from "./styles";

const TABS = [
  { key: "file", label: "From file" },
  { key: "url", label: "From URL" },
  { key: "community", label: "Community" },
];

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
        {tab === "community" && <CommunityImportTab onClose={onClose} />}
      </div>
    </Drawer>
  );
}

function FileImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");

  const onFile = async (file: File) => {
    const text = await file.text();
    setBody(text);
    if (!name.trim()) setName(nameFromMarkdown(text, file.name.replace(/\.\w+$/, "")));
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = () =>
    create.mutate(
      { name: name.trim() || undefined, type, body, source: "manual" },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
        },
      },
    );

  return (
    <div style={s.form}>
      <FormField label="File">
        <input
          type="file"
          accept=".md,.markdown,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </FormField>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
      </FormField>
      <FormField label={t("preview.typeLabel")}>
        <Select value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={10} mono placeholder={t("file.bodyPlaceholder")} />
      </FormField>
      <Button kind="primary" icon="Upload" onClick={submit} disabled={!body.trim() || create.isPending}>
        {create.isPending ? t("file.importing") : t("file.import")}
      </Button>
    </div>
  );
}

function UrlImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const importUrl = useImportSkillUrl();
  const [url, setUrl] = React.useState("");

  const submit = () =>
    importUrl.mutate(url.trim(), {
      onSuccess: (skill) => {
        toast.success(t("url.success", { name: skill.name }));
        onClose();
      },
    });

  return (
    <div style={s.form}>
      <FormField label={t("url.label")} hint={t("url.hint")}>
        <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} />
      </FormField>
      {importUrl.isError && (
        <ErrorState
          body={importUrl.error instanceof ApiError ? importUrl.error.message : t("drawer.importFailed")}
        />
      )}
      <Button kind="primary" icon="Link" onClick={submit} disabled={!url.trim() || importUrl.isPending}>
        {importUrl.isPending ? t("url.fetching") : t("url.import")}
      </Button>
    </div>
  );
}

function CommunityImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [lang, setLang] = React.useState<string | null>(null);
  // Unfiltered catalog just to derive the language pills — so picking a pill
  // never removes OTHER pills from view as the result set narrows.
  const { data: allResults } = useCommunitySkills("");
  const { data: results, isLoading, isError, refetch } = useCommunitySkills(query, lang ?? undefined);
  const importCommunity = useImportCommunitySkill();

  const languages = [...new Set((allResults ?? []).map((r) => r.lang))].sort();

  const submit = (name: string) =>
    importCommunity.mutate(name, {
      onSuccess: (skill) => toast.success(t("file.success", { name: skill.name })),
    });

  return (
    <div style={s.form}>
      <FormField label={t("community.searchPlaceholder")}>
        <TextInput value={query} onChange={setQuery} placeholder={t("community.searchPlaceholder")} />
      </FormField>
      {languages.length > 1 && (
        <div style={s.langPills}>
          <Chip active={lang === null} onClick={() => setLang(null)}>
            {t("community.allLanguages")}
          </Chip>
          {languages.map((l) => (
            <Chip key={l} active={lang === l} onClick={() => setLang(l)}>
              {l}
            </Chip>
          ))}
        </div>
      )}
      {isError && <ErrorState body={t("community.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && (results ?? []).length === 0 && (
        <div style={s.noMatch}>
          <div style={s.noMatchTitle}>{t("community.noMatch.title")}</div>
          <div>{t("community.noMatch.body")}</div>
        </div>
      )}
      <div style={s.communityList}>
        {(results ?? []).map((r) => (
          <div key={r.name} style={s.communityRow}>
            <div style={s.communityInfo}>
              <div style={s.communityName}>{r.name}</div>
              <div style={s.communityMeta}>
                <Icon.Star size={11} />
                {r.stars}
                <span>·</span>
                {r.repo}
              </div>
              <div style={s.communityDesc}>{r.desc}</div>
            </div>
            <Button
              kind="secondary"
              size="sm"
              onClick={() => submit(r.name)}
              disabled={importCommunity.isPending}
            >
              {importCommunity.isPending ? t("community.importing") : t("community.import")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
