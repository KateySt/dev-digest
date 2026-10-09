"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useCiPreview, usePublishCi } from "@/lib/hooks/ci";
import { providerSecretKey } from "./helpers";
import { s } from "./styles";

/** "Publish to CI" / "Update CI" — the same action; `republish` is just
 *  whether an installation already exists for this agent (any repo), used
 *  only to prefill the repo field and pick a friendlier label. */
export function PublishDialog({
  agent,
  defaultRepo,
  onClose,
}: {
  agent: Agent;
  defaultRepo?: string;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const { data: files, isLoading: loadingPreview } = useCiPreview(agent.id, true);
  const publish = usePublishCi();
  const [repo, setRepo] = React.useState(defaultRepo ?? "");

  const result = publish.data;

  const handlePublish = () => {
    if (!repo.trim()) return;
    publish.mutate({ agentId: agent.id, repo: repo.trim() });
  };

  return (
    <Modal width={620} onClose={onClose}>
      <Modal.Header
        title={t("publishDialog.title")}
        subtitle={t("publishDialog.subtitle", { agentName: agent.name, repo: repo || t("exportWizard.ownerRepo") })}
        onClose={onClose}
      />
      <div style={s.body}>
        {result ? (
          <div style={s.doneWrap}>
            <div style={s.doneTitle}>{t("publishDialog.doneTitle")}</div>
            <div style={s.doneBody}>{t("publishDialog.doneBody", { repo })}</div>
            <a href={result.url} target="_blank" rel="noreferrer" style={s.prLink}>
              {t("publishDialog.openPr")} →
            </a>
          </div>
        ) : (
          <>
            <p style={s.intro}>{t("publishDialog.intro", { repo: repo || t("exportWizard.ownerRepo") })}</p>

            <div>
              <div style={s.filesLabel}>{t("publishDialog.filesLabel")}</div>
              {loadingPreview && <span style={s.secretNote}>{t("publishDialog.generating")}</span>}
              {files?.map((f) => (
                <div key={f.path} style={s.fileBlock}>
                  <div className="mono" style={s.filePath}>
                    {f.path}
                  </div>
                  <pre className="mono" style={s.fileContent}>
                    {f.content}
                  </pre>
                </div>
              ))}
            </div>

            <TextInput
              value={repo}
              onChange={setRepo}
              placeholder={t("exportWizard.repoPlaceholder")}
              mono
            />

            <p style={s.secretNote}>{t("publishDialog.secretNote", { key: providerSecretKey(agent.provider) })}</p>
          </>
        )}
      </div>

      <Modal.Footer>
        {result ? (
          <div style={s.footer}>
            <div style={{ flex: 1 }} />
            <Button kind="ghost" onClick={onClose}>
              {t("publishDialog.close")}
            </Button>
          </div>
        ) : (
          <div style={s.footer}>
            <div style={{ flex: 1 }} />
            <Button kind="ghost" onClick={onClose}>
              {t("publishDialog.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="GitPullRequest"
              onClick={handlePublish}
              disabled={!repo.trim() || publish.isPending}
            >
              {publish.isPending
                ? t("publishDialog.publishing")
                : defaultRepo
                  ? t("publishDialog.republish")
                  : t("publishDialog.publish")}
            </Button>
          </div>
        )}
      </Modal.Footer>
    </Modal>
  );
}
