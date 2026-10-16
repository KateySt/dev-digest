/* RepoStep — last, optional wizard step: clone a first repository. Same flow
   as AddRepoView; "Skip for now" lands on the home empty state instead. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAddRepo } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { STEP } from "../../constants";

export function RepoStep({ onBack }: { onBack: () => void }) {
  const t = useTranslations("firstRun");
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { mutate, isPending } = useAddRepo();

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed || isPending) return;
    setError(null);
    mutate(trimmed, {
      onSuccess: (repo) => router.replace(`/repos/${repo.id}/pulls`),
      onError: (e) => setError(e instanceof ApiError ? e.message : t("repo.failed")),
    });
  };

  return (
    <div>
      <h1 className={STEP.title}>{t("repo.title")}</h1>
      <p className={STEP.body}>{t("repo.body")}</p>

      <FormField label={t("repo.label")} hint={t("repo.hint")}>
        <Input
          className="mono"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          aria-label={t("repo.label")}
          placeholder={t("repo.placeholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </FormField>

      {error && (
        <div role="alert" className={cn(STEP.result, STEP.resultFail)}>
          <Icon.XCircle size={16} className="text-crit" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className={STEP.actions}>
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => router.replace("/")}>
          {t("repo.skip")}
        </Button>
        <Button onClick={submit} disabled={!url.trim() || isPending}>
          <Icon.Plus aria-hidden />
          {isPending ? t("repo.adding") : t("repo.add")}
        </Button>
      </div>
    </div>
  );
}
