"use client";

import React from "react";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Empty state: icon tile, title, optional body and a "+ cta" button. */
export function EmptyState({
  icon,
  title,
  body,
  cta,
  onCta,
  ctaLoading,
}: {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  cta?: string;
  onCta?: () => void;
  ctaLoading?: boolean;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <Empty className="gap-2 px-7 py-15">
      <EmptyHeader className="gap-2">
        {I && (
          <EmptyMedia
            variant="icon"
            className="size-11 rounded-xl border border-border bg-elevated text-subtle-foreground"
          >
            <I size={22} aria-hidden />
          </EmptyMedia>
        )}
        <EmptyTitle className="text-md font-semibold tracking-normal text-foreground">{title}</EmptyTitle>
        {body && (
          <EmptyDescription className="max-w-[340px] text-base leading-normal text-muted-foreground">
            {body}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {cta && (
        <EmptyContent className="mt-3">
          <Button variant="secondary" onClick={onCta} disabled={ctaLoading}>
            {ctaLoading ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Plus aria-hidden />}
            {cta}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
