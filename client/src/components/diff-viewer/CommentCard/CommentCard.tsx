/* CommentCard — one review comment rendered as a Card with avatar + markdown
   body. Used by CommentThreadView and OutdatedComments. Edit/delete post
   straight to GitHub via the same DiffCommentApi the composer uses — GitHub
   itself rejects editing/deleting a comment the connected token didn't
   author (403), surfaced the same way a failed post already is. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Card, Avatar, Markdown, Textarea, Button } from "@devdigest/ui";
import type { PrReviewComment } from "@/lib/types";
import { cs, type DiffCommentApi } from "../comments";

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
    <Card>
      <div style={cs.headRow}>
        <Avatar name={c.user} size={20} />
        <span style={cs.user}>{c.user}</span>
        <span style={cs.time}>{formatWhen(c.created_at)}</span>
        <span style={{ flex: 1 }} />
        {commenting && !editing && (
          <>
            <IconBtn icon="Edit" label={t("diffViewer.editLabel")} size={24} onClick={startEdit} />
            <IconBtn icon="Trash" label={t("diffViewer.deleteLabel")} size={24} danger onClick={() => void remove()} />
          </>
        )}
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" style={cs.ghLink}>
          <Icon.ExternalLink size={12} />
          {t("diffViewer.viewOnGitHub")}
        </a>
      </div>
      {editing ? (
        <div
          style={cs.composer}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
          }}
        >
          <Textarea value={text} onChange={setText} rows={3} />
          <div style={cs.composerActions}>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              loading={commenting?.updating}
              disabled={commenting?.updating || !text.trim()}
              onClick={() => void save()}
            >
              {t("diffViewer.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)} disabled={commenting?.updating}>
              {t("diffViewer.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div style={cs.mdBody}>
          <Markdown>{c.body}</Markdown>
        </div>
      )}
    </Card>
  );
}
