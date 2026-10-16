/* Test helper: an intl provider that always carries the `common` namespace
   (shared UI strings used by components/ui and the domain components) plus
   whatever feature namespaces a test passes in. */
import React from "react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../messages/en/common.json";

export function IntlWrapper({
  children,
  messages = {},
}: {
  children: React.ReactNode;
  messages?: Record<string, unknown>;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ common, ...messages } as never}>
      {children}
    </NextIntlClientProvider>
  );
}
