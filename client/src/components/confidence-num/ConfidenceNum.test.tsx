
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfidenceNum } from "./ConfidenceNum";

afterEach(cleanup);

const renderNum = (value: number) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfidenceNum value={value} />
    </NextIntlClientProvider>,
  );

describe("ConfidenceNum", () => {
  it("rounds to a percentage", () => {
    renderNum(0.876);
    expect(screen.getByTitle("Model confidence")).toHaveTextContent("88% conf");
  });

  it.each([
    [0.9, "bg-ok"],
    [0.7, "bg-warn"],
    [0.4, "bg-subtle-foreground"],
  ])("colours the dot by band (%s → %s)", (value, cls) => {
    renderNum(value);
    expect(screen.getByTestId("confidence-dot")).toHaveClass(cls);
  });
});
