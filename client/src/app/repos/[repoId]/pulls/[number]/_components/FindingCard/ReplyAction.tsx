/* "Reply to author": a confirmation dialog with the target file:line and an
   editable body prefilled from the finding. Nothing is posted until the user
   confirms; on error the dialog stays open with the message and the edited
   text. After a post (or on reload) it reads "Posted · View on GitHub".
   The mutation hook lives in the dialog, which mounts only when opened. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
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
import { Textarea } from "@/components/ui/textarea";
import type { FindingRecord } from "@devdigest/shared";
import { useReplyToFinding } from "@/lib/hooks/reviews";
import { buildReplyBody } from "./helpers";
import { INLINE_LINK } from "./constants";

const LABEL = "mt-1 text-xs font-bold tracking-[0.04em] text-subtle-foreground uppercase";

export function ReplyAction({ f, prId }: { f: FindingRecord; prId?: string | null }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const [postedUrl, setPostedUrl] = React.useState<string | null>(null);

  const url = f.reply_url ?? postedUrl;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
        {t("finding.replyPosted")}
      </a>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon.MessageSquare aria-hidden />
        {t("finding.replyToAuthor")}
      </Button>
      {/* The dialog portals to <body>, so the dimmed (decided) card does not fade it. */}
      {open && (
        <ReplyDialog
          f={f}
          prId={prId}
          onClose={() => setOpen(false)}
          onPosted={(posted) => {
            setPostedUrl(posted);
            setOpen(false);
          }}
        />
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
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("finding.replyDialogTitle")}</DialogTitle>
          <DialogDescription>{t("finding.replyDialogSubtitle")}</DialogDescription>
        </DialogHeader>
      <DialogBody className="flex flex-col gap-2 px-6 py-4">
        <div className={LABEL}>{t("finding.replyTarget")}</div>
        {/* file:line is one unbreakable mono word: let it wrap (client/INSIGHTS.md 2026-09-24). */}
        <div className="mono min-w-0 text-sm text-foreground wrap-anywhere break-words">
          {f.file}:{f.end_line}
        </div>
        <div className={LABEL}>{t("finding.replyBodyLabel")}</div>
        <Textarea
          className="mono"
          aria-label={t("finding.replyBodyLabel")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
        />
        {reply.isError && (
          <div role="alert" className="min-w-0 text-sm text-crit wrap-anywhere">
            {t("finding.replyFailed", { message: reply.error instanceof Error ? reply.error.message : String(reply.error) })}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={close} disabled={reply.isPending}>
          {t("finding.cancel")}
        </Button>
        <Button onClick={confirm} disabled={reply.isPending || !body.trim()}>
          {reply.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
          {reply.isPending ? t("finding.replyPosting") : t("finding.replyPost")}
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
