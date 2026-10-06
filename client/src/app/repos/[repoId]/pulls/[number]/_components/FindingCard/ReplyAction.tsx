/* "Reply to author": a confirmation dialog with the target file:line and an
   editable body prefilled from the finding. Nothing is posted until the user
   confirms; on error the dialog stays open with the message and the edited
   text. After a post (or on reload) it reads "Posted · View on GitHub".
   The mutation hook lives in the dialog, which mounts only when opened. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, Textarea } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useReplyToFinding } from "@/lib/hooks/reviews";
import { buildReplyBody } from "./helpers";
import { s } from "./styles";

export function ReplyAction({ f, prId }: { f: FindingRecord; prId?: string | null }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const [postedUrl, setPostedUrl] = React.useState<string | null>(null);

  const url = f.reply_url ?? postedUrl;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={s.inlineLink}>
        {t("finding.replyPosted")}
      </a>
    );
  }

  return (
    <>
      <Button kind="secondary" size="sm" icon="MessageSquare" onClick={() => setOpen(true)}>
        {t("finding.replyToAuthor")}
      </Button>
      {/* Portal: the card is dimmed (opacity) once decided, which would fade the dialog too. */}
      {open &&
        createPortal(
          <ReplyDialog
            f={f}
            prId={prId}
            onClose={() => setOpen(false)}
            onPosted={(posted) => {
              setPostedUrl(posted);
              setOpen(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function ReplyDialog({
  f,
  prId,
  onClose,
  onPosted,
}: {
  f: FindingRecord;
  prId?: string | null;
  onClose: () => void;
  onPosted: (url: string) => void;
}) {
  const t = useTranslations("prReview");
  const reply = useReplyToFinding(prId);
  const [body, setBody] = React.useState(() => buildReplyBody(f, t("finding.replySuggestionHeading")));

  const close = () => {
    if (!reply.isPending) onClose();
  };
  const confirm = () => {
    reply.mutate({ findingId: f.id, reply: body }, { onSuccess: (comment) => onPosted(comment.html_url) });
  };

  return (
    <Modal width={600} onClose={close}>
      <Modal.Header title={t("finding.replyDialogTitle")} subtitle={t("finding.replyDialogSubtitle")} onClose={close} />
      <div style={s.dialogBody}>
        <div style={s.dialogLabel}>{t("finding.replyTarget")}</div>
        <div className="mono" style={s.dialogTarget}>
          {f.file}:{f.end_line}
        </div>
        <div style={s.dialogLabel}>{t("finding.replyBodyLabel")}</div>
        <Textarea value={body} onChange={setBody} rows={9} mono />
        {reply.isError && (
          <div role="alert" style={s.dialogError}>
            {t("finding.replyFailed", { message: reply.error instanceof Error ? reply.error.message : String(reply.error) })}
          </div>
        )}
      </div>
      <Modal.Footer>
        <div style={s.dialogFooter}>
          <Button kind="secondary" onClick={close} disabled={reply.isPending}>
            {t("finding.cancel")}
          </Button>
          <Button kind="primary" onClick={confirm} loading={reply.isPending} disabled={!body.trim()}>
            {reply.isPending ? t("finding.replyPosting") : t("finding.replyPost")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
