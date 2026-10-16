/* InlineComposer — shared inline comment composer (new comment or reply to a
   thread). Posts live to GitHub via the DiffCommentApi. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type DiffCommentApi } from "../comments";
import { COMPOSER_ACTIONS, RAIL } from "../constants";

export function InlineComposer({
  commenting,
  path,
  line,
  side,
  inReplyTo,
  onClose,
}: {
  commenting: DiffCommentApi;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  inReplyTo?: number;
  onClose: () => void;
}) {
  const t = useTranslations("shell");
  const [text, setText] = React.useState("");
  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await commenting.onSubmit({
        path,
        line,
        side,
        body,
        ...(inReplyTo != null ? { in_reply_to: inReplyTo } : {}),
      });
      setText("");
      onClose();
    } catch {
      /* error toast is raised by the caller; keep the draft open */
    }
  };
  return (
    <div
      className={RAIL}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("diffViewer.commentPlaceholder")}
      />
      <div className={COMPOSER_ACTIONS}>
        <Button size="sm" disabled={commenting.posting || !text.trim()} onClick={() => void submit()}>
          {commenting.posting ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.MessageSquare aria-hidden />}
          {t("diffViewer.post")}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose} disabled={commenting.posting}>
          {t("diffViewer.cancel")}
        </Button>
        <span className="text-[11.5px] text-subtle-foreground">{t("diffViewer.postedToGitHub")}</span>
      </div>
    </div>
  );
}
