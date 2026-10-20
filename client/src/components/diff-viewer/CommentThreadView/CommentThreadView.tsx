/* CommentThreadView — a single thread (root comment + replies) with an inline
   reply composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { CommentThread, DiffCommentApi } from "../comments";
import { RAIL } from "../constants";
import { CommentCard } from "../CommentCard";
import { InlineComposer } from "../InlineComposer";

export function CommentThreadView({
  thread,
  commenting,
  path,
}: {
  thread: CommentThread;
  commenting: DiffCommentApi;
  path: string;
}) {
  const t = useTranslations("shell");
  const [replying, setReplying] = React.useState(false);
  return (
    <div className={RAIL}>
      {thread.comments.map((c) => (
        <CommentCard key={c.id} c={c} commenting={commenting} />
      ))}
      {commenting.canComment &&
        (replying ? (
          <InlineComposer
            commenting={commenting}
            path={path}
            line={thread.line!}
            side={thread.side}
            inReplyTo={thread.rootId}
            onClose={() => setReplying(false)}
          />
        ) : (
          <div>
            <Button variant="outline" size="sm" onClick={() => setReplying(true)}>
              <Icon.CornerDownRight aria-hidden />
              {t("diffViewer.reply")}
            </Button>
          </div>
        ))}
    </div>
  );
}
