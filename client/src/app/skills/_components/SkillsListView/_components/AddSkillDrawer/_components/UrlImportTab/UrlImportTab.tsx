"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImportSkillUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import { FORM } from "../../constants";

/** From-URL tab — server-side fetch, stored disabled. Always global, same
 *  as the file tab (no project picker — client spec non-goal). */
export function UrlImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const importUrl = useImportSkillUrl();
  const id = React.useId();
  const [url, setUrl] = React.useState("");

  const submit = () =>
    importUrl.mutate(url.trim(), {
      onSuccess: (skill) => {
        toast.success(t("url.success", { name: skill.name }));
        onClose();
      },
    });

  return (
    <div className={FORM}>
      <FormField label={t("url.label")} hint={t("url.hint")} htmlFor={`${id}-url`}>
        <Input id={`${id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("url.placeholder")} />
      </FormField>
      {importUrl.isError && (
        <ErrorState
          body={importUrl.error instanceof ApiError ? importUrl.error.message : t("drawer.importFailed")}
        />
      )}
      <Button onClick={submit} disabled={!url.trim() || importUrl.isPending}>
        {importUrl.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Link aria-hidden />}
        {importUrl.isPending ? t("url.fetching") : t("url.import")}
      </Button>
    </div>
  );
}
