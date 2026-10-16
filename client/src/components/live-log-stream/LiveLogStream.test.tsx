import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { LiveLogStream } from "./LiveLogStream";
import type { LogLine } from "./constants";

afterEach(cleanup);

const LOG: LogLine[] = [
  { t: "00:01", k: "info", m: "Fetching diff" },
  { t: "00:02", k: "error", m: "Rate limited" },
];

const renderLog = (props: Partial<React.ComponentProps<typeof LiveLogStream>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <LiveLogStream log={LOG} {...props} />
    </NextIntlClientProvider>,
  );

describe("LiveLogStream", () => {
  it("filters lines by message or kind", () => {
    renderLog();
    expect(screen.getByText("2 lines")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter log…"), { target: { value: "error" } });
    expect(screen.queryByText("Fetching diff")).not.toBeInTheDocument();
    expect(screen.getByText("Rate limited")).toBeInTheDocument();
    expect(screen.getByText("1 line")).toBeInTheDocument();
  });

  it("shows the running label instead of the line count", () => {
    renderLog({ running: true, elapsedLabel: "Running 0:12" });
    expect(screen.getByText("Running 0:12")).toBeInTheDocument();
    expect(screen.queryByText("2 lines")).not.toBeInTheDocument();
  });

  it("confirms copying", () => {
    renderLog();
    fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });
});
