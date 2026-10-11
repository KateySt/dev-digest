/* RepoStep — last, optional wizard step: clone a first repository. Same flow
   as AddRepoView; "Skip for now" lands on the home empty state instead. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, TextInput } from "@devdigest/ui";
import { useAddRepo } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { stepStyles } from "../../styles";

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
      <h1 style={stepStyles.title}>{t("repo.title")}</h1>
      <p style={stepStyles.body}>{t("repo.body")}</p>

      <FormField label={t("repo.label")} hint={t("repo.hint")}>
        <TextInput
          value={url}
          onChange={setUrl}
          mono
          autoFocus
          aria-label={t("repo.label")}
          placeholder="https://github.com/owner/repo"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </FormField>

      {error && (
        <div role="alert" style={stepStyles.result(false)}>
          <Icon.XCircle size={16} style={{ color: "var(--crit)" }} />
          <span>{error}</span>
        </div>
      )}

      <div style={stepStyles.actions}>
        <Button kind="ghost" size="md" onClick={onBack}>
          {t("back")}
        </Button>
        <div style={stepStyles.spacer} />
        <Button kind="tertiary" size="md" onClick={() => router.replace("/")}>
          {t("repo.skip")}
        </Button>
        <Button kind="primary" size="md" icon="Plus" onClick={submit} disabled={!url.trim() || isPending}>
          {isPending ? t("repo.adding") : t("repo.add")}
        </Button>
      </div>
    </div>
  );
}
