/* AddRepoView — add-repository screen body. URL only. API keys (OpenAI /
   Anthropic / GitHub PAT) are NOT entered here; they live in Settings → API
   Keys and don't change per repo. Escapable: Esc or the close button returns
   to the app. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { TitlebarStrip } from "@/components/window-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useAddRepo } from "@/lib/hooks";
import { ApiError } from "@/lib/api";

export function AddRepoView() {
  const t = useTranslations("onboarding.addRepo");
  const router = useRouter();
  const urlId = React.useId();
  const [repoUrl, setRepoUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addRepo = useAddRepo();

  const close = React.useCallback(() => router.push("/"), [router]);

  // Escapable (the footer advertises Esc — make it real).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const submit = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    try {
      const repo = await addRepo.mutateAsync(repoUrl.trim());
      router.push(`/repos/${repo.id}/pulls`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("failed"));
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-7 py-11">
      <TitlebarStrip />
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-7.5 place-items-center rounded-lg bg-foreground">
          <Icon.Layers size={17} className="text-background" aria-hidden />
        </div>
        <span className="text-2xl font-bold tracking-[-0.02em]">{t("brand")}</span>
      </div>

      <div className="relative w-[520px] max-w-full rounded-[14px] border border-border bg-elevated p-9 shadow-modal">
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
          aria-label={t("close")}
          title={t("close")}
          onClick={close}
        >
          <Icon.X aria-hidden />
        </Button>

        <h1 className="text-3xl font-bold tracking-[-0.02em]">{t("title")}</h1>
        <p className="mt-2 mb-7 text-base leading-normal text-muted-foreground">
          {t.rich("body", {
            settings: (chunks) => (
              <a
                href="/settings/api-keys"
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/settings/api-keys");
                }}
                className="text-brand-text"
              >
                {chunks}
              </a>
            ),
          })}
        </p>

        <FormField label={t("urlLabel")} hint={t("urlHint")} htmlFor={urlId}>
          <Input
            id={urlId}
            className="mono"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </FormField>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-crit/25 bg-crit-bg px-3.5 py-3">
            <Icon.XCircle size={16} className="text-crit" aria-hidden />
            <span className="text-sm text-muted-foreground">{error}</span>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button variant="outline" onClick={close}>
            {t("cancel")}
          </Button>
          <div className="flex-1" />
          <Button onClick={submit} disabled={!repoUrl.trim() || addRepo.isPending}>
            <Icon.Plus aria-hidden />
            {addRepo.isPending ? t("adding") : t("add")}
          </Button>
        </div>
      </div>

      <p className="mt-6 inline-flex items-center gap-2 text-sm text-subtle-foreground">
        <Icon.Lock size={12} aria-hidden />
        {t.rich("footer", {
          kbd: (chunks) => <Kbd className="mono border border-border-strong bg-surface">{chunks}</Kbd>,
        })}
      </p>
    </div>
  );
}
