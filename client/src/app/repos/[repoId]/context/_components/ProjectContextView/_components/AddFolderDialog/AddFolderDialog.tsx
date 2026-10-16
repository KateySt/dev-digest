"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const folderId = React.useId();
  const documentId = React.useId();
  const [folder, setFolder] = React.useState("");
  const [document, setDocument] = React.useState("");

  const canCreate = folder.trim().length > 0 && document.trim().length > 0 && !creating;

  const submit = () => {
    if (!canCreate) return;
    const path = buildDocumentPath(folder, document);
    onCreate(path, defaultDocumentContent(document));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("addFolderDialog.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-6">
          <FormField
            label={t("addFolderDialog.folderLabel")}
            hint={t("addFolderDialog.folderHint")}
            required
            htmlFor={folderId}
          >
            <Input
              id={folderId}
              className="mono"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={t("addFolderDialog.folderPlaceholder")}
            />
          </FormField>
          <FormField label={t("addFolderDialog.documentLabel")} required htmlFor={documentId}>
            <Input
              id={documentId}
              className="mono"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder={t("addFolderDialog.documentPlaceholder")}
            />
          </FormField>
          {error && <div className="text-sm text-crit">{error}</div>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("addFolderDialog.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canCreate}>
            {creating && <Icon.Loader className="animate-spin" aria-hidden />}
            {creating ? t("addFolderDialog.creating") : t("addFolderDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
