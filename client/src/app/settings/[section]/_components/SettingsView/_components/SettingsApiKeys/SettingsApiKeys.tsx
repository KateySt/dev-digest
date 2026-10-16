"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTestConnection, useSecretsStatus } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { ConnTestProvider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionTitle } from "../SectionTitle";
import { KEY_ROWS } from "./constants";

/** "Configured / Not set" pill driven by GET /settings/secrets-status. */
function StatusBadge({ configured }: { configured: boolean | undefined }) {
  const t = useTranslations("settings");
  if (configured === undefined) return null; // status still loading
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        configured ? "text-ok" : "text-subtle-foreground",
      )}
    >
      <span aria-hidden className={cn("size-[7px] rounded-full", configured ? "bg-ok" : "bg-subtle-foreground")} />
      {configured ? t("apiKeys.configured") : t("apiKeys.notSet")}
    </span>
  );
}

function KeyRow({
  label,
  provider,
  hint,
  configured,
}: {
  label: string;
  provider: ConnTestProvider;
  hint: string;
  configured: boolean | undefined;
}) {
  const t = useTranslations("settings");
  const inputId = React.useId();
  const [val, setVal] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const test = useTestConnection();
  const [res, setRes] = React.useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setRes(null);
    try {
      const r = await test.mutateAsync({ provider, key: val.trim() || undefined });
      setRes({ ok: r.ok, message: r.message });
    } catch (e) {
      setRes({ ok: false, message: e instanceof ApiError ? e.message : t("apiKeys.testFailed") });
    }
  };

  return (
    <FormField label={label} hint={hint} right={<StatusBadge configured={configured} />} htmlFor={inputId}>
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Input
            id={inputId}
            className="mono pr-9"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type={reveal ? "text" : "password"}
            placeholder={t("apiKeys.placeholder")}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? t("apiKeys.hideKey") : t("apiKeys.showKey")}
            aria-pressed={reveal}
            className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer border-none bg-transparent p-0 text-subtle-foreground hover:text-foreground"
          >
            <Icon.EyeOff size={14} aria-hidden />
          </button>
        </div>
        <Button variant="secondary" onClick={run} disabled={test.isPending}>
          {test.isPending ? t("apiKeys.testing") : t("apiKeys.testConnection")}
        </Button>
      </div>
      {res && (
        <div className={cn("mt-2.5 inline-flex items-center gap-2 text-sm font-semibold", res.ok ? "text-ok" : "text-crit")}>
          {res.ok ? <Icon.CheckCircle size={13} aria-hidden /> : <Icon.XCircle size={13} aria-hidden />}
          {res.message}
        </div>
      )}
    </FormField>
  );
}

export function SettingsApiKeys() {
  const t = useTranslations("settings");
  const { data: status } = useSecretsStatus();
  return (
    <div className="max-w-[640px]">
      <SectionTitle title={t("apiKeys.title")} body={t("apiKeys.body")} />
      {KEY_ROWS.map((row) => (
        <KeyRow
          key={row.provider}
          label={t(row.labelKey)}
          provider={row.provider}
          hint={t(row.hintKey)}
          configured={status?.[row.provider]}
        />
      ))}
    </div>
  );
}
