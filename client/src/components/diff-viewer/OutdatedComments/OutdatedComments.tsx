/* OutdatedComments — footer list for comments GitHub can no longer place on the
   current diff (the anchored line is gone). */
"use client";

import { useTranslations } from "next-intl";
import type { CommentThread, DiffCommentApi } from "../comments";
import { SEVERITY_LABEL } from "../constants";
import { CommentCard } from "../CommentCard";

export function OutdatedComments({
  threads,
  commenting,
}: {
  threads: CommentThread[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  if (threads.length === 0) return null;
  const count = threads.reduce((n, th) => n + th.comments.length, 0);
  return (
    <div className="mx-3.5 my-1 ml-14.5 flex flex-col gap-2 border-t border-border pt-2.5">
      <span className={`${SEVERITY_LABEL} text-subtle-foreground`}>{t("diffViewer.outdatedTitle", { count })}</span>
      {threads.flatMap((th) =>
        th.comments.map((c) => <CommentCard key={c.id} c={c} commenting={commenting} />),
      )}
    </div>
  );
}
