/* KeyStep — one "paste a key, verify it, continue" wizard step. Saving and
   verifying is a single call: POST /settings/test-connection persists the key
   through SecretsProvider and then makes a cheap live request. Used for both
   the LLM-provider step (with a provider switch) and the GitHub PAT step. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, TextInput } from "@devdigest/ui";
import { useTestConnection } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { ConnTestProvider, SecretsStatus } from "@/lib/types";
import { KEY_URLS } from "../../constants";
import { stepStyles } from "../../styles";
import { s } from "./styles";

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
      <h1 style={stepStyles.title}>{title}</h1>
      <p style={stepStyles.body}>{body}</p>

      {providers.length > 1 && (
        <div style={s.switch} role="group" aria-label={label}>
          {providers.map((p) => (
            <Button
              key={p}
              kind={p === provider ? "primary" : "secondary"}
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
          <a href={KEY_URLS[provider]} target="_blank" rel="noopener noreferrer" style={stepStyles.link}>
            {t("whereToGet")} →
          </a>
        }
      >
        <TextInput
          value={value}
          onChange={(v) => {
            setValue(v);
            setResult(null);
          }}
          mono
          autoFocus
          aria-label={label}
          type={reveal ? "text" : "password"}
          placeholder={configured ? "••••••••••••••••" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") primary();
          }}
          suffix={
            <span style={s.suffix}>
              <button
                type="button"
                aria-label={reveal ? "Hide key" : "Show key"}
                onClick={() => setReveal((r) => !r)}
                style={s.revealBtn}
              >
                {reveal ? <Icon.Eye size={14} /> : <Icon.EyeOff size={14} />}
              </button>
              {showConnected && (
                <span style={s.connected}>
                  <Icon.CheckCircle size={13} /> {t("connected")}
                </span>
              )}
            </span>
          }
        />
      </FormField>
      <p style={stepStyles.note}>
        <Icon.Lock size={11} /> {t("storedLocally")}
      </p>

      {configured && !draft && !result && <p style={s.configuredHint}>{t("configuredHint")}</p>}

      {result && (
        <div role="status" style={stepStyles.result(result.ok)}>
          {result.ok ? (
            <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />
          ) : (
            <Icon.XCircle size={16} style={{ color: "var(--crit)" }} />
          )}
          <span>{result.message}</span>
        </div>
      )}

      <div style={stepStyles.actions}>
        {onBack && (
          <Button kind="ghost" size="md" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        <div style={stepStyles.spacer} />
        {needsVerify ? (
          <Button kind="primary" size="md" onClick={verify} loading={isPending}>
            {isPending ? t("verifying") : t("verify")}
          </Button>
        ) : (
          <Button kind="primary" size="md" iconRight="ArrowRight" onClick={next} disabled={!canContinue} loading={isPending}>
            {t("continue")}
          </Button>
        )}
      </div>
    </div>
  );
}
