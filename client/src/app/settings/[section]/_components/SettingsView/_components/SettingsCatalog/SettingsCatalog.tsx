"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, TextInput } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import { useCatalogTest } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

/**
 * Settings → Catalog (SPEC-07 client spec AC-29 – AC-36). The catalog repo
 * is plain, visible, editable text — never masked, no reveal control
 * (unlike `SettingsApiKeys`, which is secrets-only and never shows a stored
 * value; the catalog location is non-secret and must be displayable).
 */
export function SettingsCatalog() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const test = useCatalogTest();

  const stored = settings?.community_catalog_repo ?? "";
  const resolvedDefault = settings?.community_catalog_repo_default ?? "";
  const [value, setValue] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  // Hydrate the input once the real stored value loads, without clobbering
  // an edit already in progress (settings resolve async, after first render).
  React.useEffect(() => {
    if (!hydrated && settings) {
      setValue(stored);
      setHydrated(true);
    }
  }, [hydrated, settings, stored]);

  const hasOverride = stored.trim().length > 0;
  const dirty = hydrated && value !== stored;

  const save = () => update.mutate({ community_catalog_repo: value.trim() });

  const runTest = async () => {
    setResult(null);
    try {
      // Tests the current (possibly unsaved) field value — AC-34.
      const r = await test.mutateAsync(value.trim() || undefined);
      setResult({ ok: r.ok, message: r.message });
    } catch (e) {
      setResult({ ok: false, message: e instanceof ApiError ? e.message : t("catalog.testFailed") });
    }
  };

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("catalog.title")} body={t("catalog.body")} />
      <FormField
        label={t("catalog.repoLabel")}
        hint={!hasOverride ? t("catalog.usingDefault", { value: resolvedDefault }) : undefined}
      >
        <TextInput value={value} onChange={setValue} placeholder={t("catalog.repoPlaceholder")} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t("catalog.saving") : t("catalog.save")}
        </Button>
        <Button kind="secondary" onClick={runTest} disabled={test.isPending}>
          {test.isPending ? t("catalog.testing") : t("catalog.test")}
        </Button>
      </div>
      {result && (
        <div style={s.result(result.ok)}>
          {result.ok ? <Icon.CheckCircle size={13} /> : <Icon.XCircle size={13} />}
          {result.message}
        </div>
      )}
    </div>
  );
}
