/* CommentCard — one review comment rendered as a Card with avatar + markdown
   body. Used by CommentThreadView and OutdatedComments. Edit/delete post
   straight to GitHub via the same DiffCommentApi the composer uses — GitHub
   itself rejects editing/deleting a comment the connected token didn't
   author (403), surfaced the same way a failed post already is. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PrReviewComment } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import { COMMENT_BODY, COMMENT_CARD, COMMENT_HEAD, COMMENT_META, COMMENT_USER, COMPOSER_ACTIONS } from "../constants";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function CommentCard({ c, commenting }: { c: PrReviewComment; commenting?: DiffCommentApi }) {
  const t = useTranslations("shell");
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(c.body);

  const startEdit = () => {
    setText(c.body);
    setEditing(true);
  };

  const save = async () => {
    const body = text.trim();
    if (!body || !commenting) return;
    try {
      await commenting.onUpdate(c.id, body);
      setEditing(false);
    } catch {
      /* error toast is raised by the caller; keep the draft open */
    }
  };

  const remove = async () => {
    if (!commenting) return;
    if (!window.confirm(t("diffViewer.deleteConfirm"))) return;
    try {
      await commenting.onDelete(c.id);
    } catch {
      /* error toast is raised by the caller */
    }
  };

  return (
    <div className={COMMENT_CARD}>
      <div className={COMMENT_HEAD}>
        <UserAvatar name={c.user} size={20} />
        <span className={COMMENT_USER}>{c.user}</span>
        <span className={COMMENT_META}>{formatWhen(c.created_at)}</span>
        <span className="flex-1" />
        {commenting && !editing && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("diffViewer.editLabel")}
              title={t("diffViewer.editLabel")}
              onClick={startEdit}
            >
              <Icon.Edit aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="hover:text-crit"
              aria-label={t("diffViewer.deleteLabel")}
              title={t("diffViewer.deleteLabel")}
              onClick={() => void remove()}
            >
              <Icon.Trash aria-hidden />
            </Button>
          </>
        )}
        <a
          href={c.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-subtle-foreground no-underline"
        >
          <Icon.ExternalLink size={12} aria-hidden />
          {t("diffViewer.viewOnGitHub")}
        </a>
      </div>
      {editing ? (
        <div
          className="flex flex-col gap-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
          }}
        >
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <div className={COMPOSER_ACTIONS}>
            <Button size="sm" disabled={commenting?.updating || !text.trim()} onClick={() => void save()}>
              {commenting?.updating ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Check aria-hidden />}
              {t("diffViewer.save")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={commenting?.updating}>
              {t("diffViewer.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={COMMENT_BODY}>
          <Markdown>{c.body}</Markdown>
        </div>
      )}
    </div>
  );
}
