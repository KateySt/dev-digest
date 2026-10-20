import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { SeverityBadge } from "./SeverityBadge";
import { CategoryTag } from "./CategoryTag";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("SeverityBadge", () => {
  it("shows the translated label and count", () => {
    wrap(<SeverityBadge severity="CRITICAL" count={3} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("compact mode keeps the label as the icon's accessible name", () => {
    wrap(<SeverityBadge severity="WARNING" compact />);
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Warning" })).toBeInTheDocument();
  });
});

describe("CategoryTag", () => {
  it("renders the translated category", () => {
    wrap(<CategoryTag category="security" />);
    expect(screen.getByText("security")).toBeInTheDocument();
  });
});
