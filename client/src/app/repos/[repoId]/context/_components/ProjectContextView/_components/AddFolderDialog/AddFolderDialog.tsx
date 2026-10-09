"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import { buildDocumentPath, defaultDocumentContent } from "../../helpers";

/** "Add folder" (C-AC-6) — requires both a folder name and a first document
 *  name, and creates the folder together with that document in ONE step
 *  (there is no separate "create empty folder" affordance). */
export function AddFolderDialog({
  onClose,
  onCreate,
  creating,
  error,
}: {
  onClose: () => void;
  onCreate: (path: string, content: string) => void;
  creating: boolean;
  error?: string | null;
}) {
  const t = useTranslations("context");
  const [folder, setFolder] = React.useState("");
  const [document, setDocument] = React.useState("");

  const canCreate = folder.trim().length > 0 && document.trim().length > 0 && !creating;

  const submit = () => {
    if (!canCreate) return;
    const path = buildDocumentPath(folder, document);
    onCreate(path, defaultDocumentContent(document));
  };

  return (
    <Modal onClose={onClose} width={480}>
      <Modal.Header title={t("addFolderDialog.title")} onClose={onClose} />
      <div style={{ padding: 24 }}>
        <FormField label={t("addFolderDialog.folderLabel")} hint={t("addFolderDialog.folderHint")} required>
          <TextInput
            value={folder}
            onChange={setFolder}
            placeholder={t("addFolderDialog.folderPlaceholder")}
            mono
          />
        </FormField>
        <FormField label={t("addFolderDialog.documentLabel")} required>
          <TextInput
            value={document}
            onChange={setDocument}
            placeholder={t("addFolderDialog.documentPlaceholder")}
            mono
          />
        </FormField>
        {error && <div style={{ fontSize: 13, color: "var(--crit)" }}>{error}</div>}
      </div>
      <Modal.Footer>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="ghost" onClick={onClose}>
            {t("addFolderDialog.cancel")}
          </Button>
          <Button kind="primary" onClick={submit} disabled={!canCreate} loading={creating}>
            {creating ? t("addFolderDialog.creating") : t("addFolderDialog.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
