/* Test helper: an intl provider that always carries the `common` namespace
   (shared UI strings used by components/ui and the domain components) plus
   whatever feature namespaces a test passes in. */
import type React from "react";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
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
      {/* Paged lists keep ?page= in the URL via nuqs, which needs an adapter. */}
      <NuqsTestingAdapter hasMemory>{children}</NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
}
