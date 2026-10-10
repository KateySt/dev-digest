"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, TextInput } from "@devdigest/ui";
import { useImportSkillUrl } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import { s } from "../../styles";

/** From-URL tab — server-side fetch, stored disabled. Always global, same
 *  as the file tab (no project picker — client spec non-goal). */
export function UrlImportTab({ onClose }: { onClose: () => void }) {
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
