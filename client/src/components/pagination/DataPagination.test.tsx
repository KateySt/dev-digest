/* DataPagination — summary, numbered pages, jump field, page size, a11y, hiding.
   jsdom applies no CSS, so every width variant is in the DOM: tests scope to
   one via data-variant. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlWrapper } from "@/test/intl";
import { DataPagination, type PagerState } from "./DataPagination";

afterEach(cleanup);

function setup(over: Partial<PagerState> = {}) {
  const pager: PagerState = {
    page: 6,
    pageCount: 13,
    pageSize: 25,
    total: 312,
    pageSizes: [10, 25, 50, 100],
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    ...over,
  };
  const utils = render(
    <IntlWrapper>
      <DataPagination pager={pager} />
    </IntlWrapper>,
  );
  const full = () => utils.container.querySelector<HTMLElement>('[data-variant="full"]')!;
  return { pager, full, ...utils };
}

describe("DataPagination", () => {
  it("summarises the range and marks the current page", () => {
    const { full } = setup();
    expect(screen.getByText("Showing 126–150 of 312")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Pagination" })).getAllByRole("button").length).toBeGreaterThan(0);
    expect(within(full()).getByRole("button", { name: "Go to page 6" })).toHaveAttribute("aria-current", "page");
    expect(within(full()).getByRole("button", { name: "Go to page 13" })).toBeInTheDocument();
    expect(within(full()).getAllByRole("button", { name: "Jump to a page" })).toHaveLength(2); // two ellipses
  });

  it("navigates with numbers, prev/next and first/last", () => {
    const { pager, full } = setup();
    fireEvent.click(within(full()).getByRole("button", { name: "Go to page 7" }));
    fireEvent.click(within(full()).getByRole("button", { name: "Go to previous page" }));
    fireEvent.click(within(full()).getByRole("button", { name: "Go to last page" }));
    fireEvent.click(within(full()).getByRole("button", { name: "Go to first page" }));
    expect(vi.mocked(pager.setPage).mock.calls.map((c) => c[0])).toEqual([7, 5, 13, 1]);
  });

  it("disables back buttons on the first page and forward ones on the last", () => {
    const first = setup({ page: 1 });
    expect(within(first.full()).getByRole("button", { name: "Go to first page" })).toBeDisabled();
    expect(within(first.full()).getByRole("button", { name: "Go to next page" })).toBeEnabled();
    cleanup();
    const last = setup({ page: 13 });
    expect(within(last.full()).getByRole("button", { name: "Go to last page" })).toBeDisabled();
  });

  it("jumps to a typed page on Enter, clamping out-of-range input", () => {
    const { pager, container } = setup();
    const field = within(container.querySelector<HTMLElement>('span[data-variant="full"]')!).getByRole("spinbutton", {
      name: "Page number",
    });
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.change(field, { target: { value: "400" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(vi.mocked(pager.setPage).mock.calls.map((c) => c[0])).toEqual([9, 13]);
    expect(field).toHaveValue(13);
  });

  it("reverts the field on Escape without navigating", () => {
    const { pager, container } = setup();
    const field = within(container.querySelector<HTMLElement>('span[data-variant="full"]')!).getByRole("spinbutton");
    fireEvent.change(field, { target: { value: "2" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue(6);
    expect(pager.setPage).not.toHaveBeenCalled();
  });

  it("an ellipsis moves focus to the jump field", () => {
    const { full, container } = setup();
    fireEvent.click(within(full()).getAllByRole("button", { name: "Jump to a page" })[0]!);
    expect(document.activeElement).toBe(
      within(container.querySelector<HTMLElement>('span[data-variant="full"]')!).getByRole("spinbutton"),
    );
  });

  it("the tiny variant's counter turns into the jump field", () => {
    const { container } = setup();
    const tiny = container.querySelector<HTMLElement>('[data-variant="tiny"]')!;
    fireEvent.click(within(tiny).getByRole("button", { name: "Jump to a page" }));
    expect(within(tiny).getByRole("spinbutton", { name: "Page number" })).toHaveValue(6);
  });

  it("renders nothing when everything fits on the smallest page size", () => {
    const { container } = setup({ total: 8, pageCount: 1, page: 1 });
    expect(container).toBeEmptyDOMElement();
  });
});
