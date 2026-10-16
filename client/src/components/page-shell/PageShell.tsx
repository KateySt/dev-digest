/* PageShell.tsx — small helpers for route pages: a section container and a
   feature-placeholder that renders inside the app shell with an EmptyState. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { IconName } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { AppShell, type Crumb } from "../app-shell";

export function PageContainer({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-8 pt-6 pb-11">
      {(title || actions) && (
        <div className="mb-5 flex items-end gap-4">
          <div>
            {title && <h1 className="text-4xl font-bold tracking-[-0.02em]">{title}</h1>}
            {subtitle && <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex gap-2.5">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Placeholder for routes owned by feature agents. Renders full shell + EmptyState. */
export function FeaturePlaceholder({
  crumb,
  title,
  icon = "Boxes",
  owner,
  body,
}: {
  crumb?: Crumb[];
  title: string;
  icon?: IconName;
  owner: string;
  body?: string;
}) {
  const t = useTranslations("shell");
  return (
    <AppShell crumb={crumb}>
      <PageContainer>
        <EmptyState icon={icon} title={title} body={body ?? t("featurePlaceholder.defaultBody", { owner })} />
      </PageContainer>
    </AppShell>
  );
}
