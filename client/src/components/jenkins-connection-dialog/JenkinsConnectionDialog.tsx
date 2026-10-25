"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { JenkinsConnection } from "@devdigest/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useDeleteJenkinsConnection,
  useJenkinsConnection,
  useSaveJenkinsConnection,
  useTestJenkinsConnection,
} from "@/lib/hooks/ci";
import { testResultMessage } from "./helpers";

export interface JenkinsConnectionDialogProps {
  /** `owner/name` — the connection is per repository. */
  repo: string;
  onClose: () => void;
}

/** Per-repo Jenkins connection: URL, username and a write-only API token,
 *  with Test (click only) and Remove. Mounted only while open. */
export function JenkinsConnectionDialog({ repo, onClose }: JenkinsConnectionDialogProps) {
  const t = useTranslations("ci.jenkins.connection");
  const connection = useJenkinsConnection(repo);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="wrap-anywhere">{t("description", { repo })}</DialogDescription>
        </DialogHeader>
        {connection.isLoading ? (
          <DialogBody className="p-6 text-sm text-muted-foreground">…</DialogBody>
        ) : (
          // Re-seed the form when the saved connection changes underneath.
          <ConnectionForm
            key={connection.data?.url ?? "new"}
            repo={repo}
            saved={connection.data ?? null}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionForm({
  repo,
  saved,
  onClose,
}: {
  repo: string;
  saved: JenkinsConnection | null;
  onClose: () => void;
}) {
  const t = useTranslations("ci.jenkins.connection");
  const [url, setUrl] = React.useState(saved?.url ?? "");
  const [username, setUsername] = React.useState(saved?.username ?? "");
  const [token, setToken] = React.useState("");
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const test = useTestJenkinsConnection();
  const save = useSaveJenkinsConnection();
  const remove = useDeleteJenkinsConnection();

  const filled = url.trim() !== "" && username.trim() !== "" && (token !== "" || !!saved?.has_token);
  const busy = save.isPending || remove.isPending;
  const id = React.useId();

  const onTest = () =>
    test.mutate({
      repo,
      url: url.trim() || null,
      username: username.trim() || null,
      api_token: token || null,
    });

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { repo, url: url.trim(), username: username.trim(), api_token: token || null },
      { onSuccess: onClose },
    );
  };

  const testMessage = test.data ? testResultMessage(test.data, t) : null;

  return (
    <form onSubmit={onSave} className="contents">
      <DialogBody className="relative flex min-w-0 flex-col p-6">
        <FormField label={t("url")} hint={t("urlHint")} required htmlFor={`${id}-url`}>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </FormField>
        <FormField label={t("username")} required htmlFor={`${id}-user`}>
          <Input
            id={`${id}-user`}
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </FormField>
        <FormField label={t("token")} hint={t("tokenHint")} required={!saved?.has_token} htmlFor={`${id}-token`}>
          <Input
            id={`${id}-token`}
            type="password"
            autoComplete="off"
            value={token}
            placeholder={saved?.has_token ? t("tokenSaved") : undefined}
            onChange={(e) => setToken(e.target.value)}
          />
        </FormField>

        <div aria-live="polite" className="min-w-0 text-sm wrap-anywhere">
          {testMessage && (
            <span className={test.data?.ok ? "text-ok" : "text-crit"}>{testMessage}</span>
          )}
        </div>
        {save.error && (
          <div role="alert" className="mt-2 min-w-0 text-sm text-crit wrap-anywhere">
            {save.error.message}
          </div>
        )}
        {confirmRemove && (
          <div role="alert" className="mt-3 flex min-w-0 flex-col gap-2 rounded-lg border border-crit bg-surface p-3 text-sm">
            <span className="wrap-anywhere">{t("removeConfirm", { repo })}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => remove.mutate({ repo }, { onSuccess: onClose })}
              >
                {t("confirmRemove")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmRemove(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter className="flex-wrap items-center gap-2">
        {saved && !confirmRemove && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
            {t("remove")}
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="outline" disabled={!filled || test.isPending} onClick={onTest}>
          {test.isPending ? t("testing") : t("test")}
        </Button>
        <Button type="submit" disabled={!filled || busy}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
