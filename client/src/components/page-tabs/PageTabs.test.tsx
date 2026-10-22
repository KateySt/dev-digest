
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PageTabs } from "./PageTabs";

afterEach(cleanup);

describe("PageTabs", () => {
  it("marks the selected tab and switches on click", () => {
    const onChange = vi.fn();
    render(
      <PageTabs
        value="overview"
        onChange={onChange}
        tabs={[{ key: "overview", label: "Overview", icon: "FileText" }, { key: "diff", label: "Files", count: 3 }]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const files = screen.getByRole("tab", { name: /Files/ });
    expect(files).toHaveAttribute("aria-selected", "false");
    expect(files).toHaveTextContent("3");
    fireEvent.click(files);
    expect(onChange).toHaveBeenCalledWith("diff");
  });
});
