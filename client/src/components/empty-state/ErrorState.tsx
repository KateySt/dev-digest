"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** Full-screen / inline error (error UX taxonomy) with Retry. */
export function ErrorState({
  title,
  body,
  onRetry,
  fullScreen,
}: {
  title?: string;
  body?: React.ReactNode;
  onRetry?: () => void;
  fullScreen?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <Empty role="alert" className={cn("gap-2.5 px-6", fullScreen ? "min-h-[60vh] py-20" : "py-10")}>
      <EmptyHeader className="gap-2.5">
        <EmptyMedia variant="icon" className="mb-1.25 size-11 rounded-xl bg-crit-bg text-crit">
          <Icon.AlertOctagon size={22} aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-lg font-bold tracking-normal text-foreground">
          {title ?? t("states.error")}
        </EmptyTitle>
        {body && (
          <EmptyDescription className="max-w-[380px] text-base leading-normal text-muted-foreground">
            {body}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {onRetry && (
        <EmptyContent className="mt-3">
          <Button variant="secondary" onClick={onRetry}>
            <Icon.RefreshCw aria-hidden />
            {t("actions.retry")}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
