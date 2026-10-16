"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import { useCatalogTest } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SectionTitle } from "../SectionTitle";

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
  const repoId = React.useId();

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
    <div className="max-w-[640px]">
      <SectionTitle title={t("catalog.title")} body={t("catalog.body")} />
      <FormField
        label={t("catalog.repoLabel")}
        hint={!hasOverride ? t("catalog.usingDefault", { value: resolvedDefault }) : undefined}
        htmlFor={repoId}
      >
        <Input
          id={repoId}
          className="mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("catalog.repoPlaceholder")}
        />
      </FormField>
      <div className="mt-1 flex gap-2.5">
        <Button onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t("catalog.saving") : t("catalog.save")}
        </Button>
        <Button variant="secondary" onClick={runTest} disabled={test.isPending}>
          {test.isPending ? t("catalog.testing") : t("catalog.test")}
        </Button>
      </div>
      {result && (
        <div className={cn("mt-3 inline-flex items-center gap-2 text-sm font-semibold", result.ok ? "text-ok" : "text-crit")}>
          {result.ok ? <Icon.CheckCircle size={13} aria-hidden /> : <Icon.XCircle size={13} aria-hidden />}
          {result.message}
        </div>
      )}
    </div>
  );
}
