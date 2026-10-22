import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { AutoTriggerStatus } from "./AutoTriggerStatus";

afterEach(cleanup);

const renderStatus = (props: React.ComponentProps<typeof AutoTriggerStatus>) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <AutoTriggerStatus {...props} />
    </NextIntlClientProvider>,
  );

describe("AutoTriggerStatus", () => {
  it("shows ON with the polling detail", () => {
    renderStatus({ on: true, detail: "polling 2m" });
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("· polling 2m")).toBeInTheDocument();
  });

  it("shows OFF without detail", () => {
    renderStatus({ on: false, detail: "polling 2m" });
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(screen.queryByText(/polling/)).not.toBeInTheDocument();
  });
});
