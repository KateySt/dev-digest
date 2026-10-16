/* KeyStep — one "paste a key, verify it, continue" wizard step. Saving and
   verifying is a single call: POST /settings/test-connection persists the key
   through SecretsProvider and then makes a cheap live request. Used for both
   the LLM-provider step (with a provider switch) and the GitHub PAT step. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTestConnection } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { ConnTestProvider, SecretsStatus } from "@/lib/types";
import { KEY_URLS, STEP } from "../../constants";

interface Result {
  ok: boolean;
  message: string;
}

export function KeyStep({
  providers,
  status,
  title,
  body,
  label,
  hint,
  onBack,
  onContinue,
}: {
  /** One entry → no switch; several → a provider switch above the input. */
  providers: readonly ConnTestProvider[];
  status: SecretsStatus | undefined;
  title: string;
  body: string;
  label: string;
  hint?: string;
  onBack?: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("firstRun");
  const [provider, setProvider] = React.useState<ConnTestProvider>(
    () => providers.find((p) => status?.[p]) ?? providers[0]!,
  );
  const [value, setValue] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const { mutate, isPending } = useTestConnection();

  const draft = value.trim();
  const configured = Boolean(status?.[provider]);
  const verified = result?.ok === true;
  // A typed-but-unverified key must be verified first. An already-configured
  // key (e.g. from .env) needs no retyping — Continue re-checks it live, since
  // "configured" only means "present", not "valid".
  const needsVerify = draft.length > 0 && !verified;
  const canContinue = verified || (configured && draft.length === 0);
  const showConnected = verified || (configured && draft.length === 0 && result?.ok !== false);

  const switchProvider = (p: ConnTestProvider) => {
    setProvider(p);
    setValue("");
    setResult(null);
  };

  /** Live-check `key` (or the stored key when omitted); the server saves a new key only if it passes. */
  const check = (key: string | undefined, onOk: (message: string, ms: number) => void) => {
    if (isPending) return;
    setResult(null);
    const started = performance.now();
    mutate(
      { provider, key },
      {
        onSuccess: (r) =>
          r.ok ? onOk(r.message, Math.round(performance.now() - started)) : setResult({ ok: false, message: r.message }),
        onError: (e) => setResult({ ok: false, message: e instanceof ApiError ? e.message : t("testFailed") }),
      },
    );
  };

  const verify = () => {
    if (draft) check(draft, (message, ms) => setResult({ ok: true, message: t("verified", { message, ms }) }));
  };

  const next = () => {
    if (verified) onContinue();
    else if (canContinue) check(undefined, () => onContinue());
  };

  const primary = () => (needsVerify ? verify() : next());

  return (
    <div>
      <h1 className={STEP.title}>{title}</h1>
      <p className={STEP.body}>{body}</p>

      {providers.length > 1 && (
        <div className="mb-5 flex gap-1.5" role="group" aria-label={label}>
          {providers.map((p) => (
            <Button
              key={p}
              variant={p === provider ? "default" : "secondary"}
              size="sm"
              aria-pressed={p === provider}
              onClick={() => switchProvider(p)}
            >
              {t(`llm.providers.${p}`)}
            </Button>
          ))}
        </div>
      )}

      <FormField
        label={label}
        hint={hint}
        right={
          <a href={KEY_URLS[provider]} target="_blank" rel="noopener noreferrer" className={STEP.link}>
            {t("whereToGet")} →
          </a>
        }
      >
        <div className="relative">
        <Input
          className="mono pr-32"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          autoFocus
          aria-label={label}
          type={reveal ? "text" : "password"}
          placeholder={configured ? "••••••••••••••••" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") primary();
          }}
        />
          <span className="absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center gap-2.5">
            <button
              type="button"
              aria-label={reveal ? t("hideKey") : t("showKey")}
              onClick={() => setReveal((r) => !r)}
              className="grid cursor-pointer place-items-center border-none bg-transparent p-0 text-subtle-foreground hover:text-foreground"
            >
              {reveal ? <Icon.Eye size={14} aria-hidden /> : <Icon.EyeOff size={14} aria-hidden />}
            </button>
            {showConnected && (
              <span className="inline-flex items-center gap-1.25 text-xs font-semibold whitespace-nowrap text-ok">
                <Icon.CheckCircle size={13} aria-hidden /> {t("connected")}
              </span>
            )}
          </span>
        </div>
      </FormField>
      <p className={STEP.note}>
        <Icon.Lock size={11} aria-hidden /> {t("storedLocally")}
      </p>

      {configured && !draft && !result && <p className="mt-4 text-sm text-muted-foreground">{t("configuredHint")}</p>}

      {result && (
        <div role="status" className={cn(STEP.result, result.ok ? STEP.resultOk : STEP.resultFail)}>
          {result.ok ? (
            <Icon.CheckCircle size={16} className="text-ok" aria-hidden />
          ) : (
            <Icon.XCircle size={16} className="text-crit" aria-hidden />
          )}
          <span>{result.message}</span>
        </div>
      )}

      <div className={STEP.actions}>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        <div className="flex-1" />
        {needsVerify ? (
          <Button onClick={verify} disabled={isPending}>
            {isPending && <Icon.Loader className="animate-spin" aria-hidden />}
            {isPending ? t("verifying") : t("verify")}
          </Button>
        ) : (
          <Button onClick={next} disabled={!canContinue || isPending}>
            {isPending && <Icon.Loader className="animate-spin" aria-hidden />}
            {t("continue")}
            <Icon.ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
