/* usePagedList — client slicing, server mode, URL state, clamping, page-size memory. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { usePagedList, type PagedListOptions } from "./usePagedList";

type Row = { id: number };
const rows: Row[] = Array.from({ length: 312 }, (_, i) => ({ id: i + 1 }));

let updates: UrlUpdateEvent[] = [];
beforeEach(() => {
  updates = [];
  localStorage.clear();
});
afterEach(() => localStorage.clear());

function setup(search: string, options: Partial<PagedListOptions<Row>> = {}) {
  return renderHook((props: Partial<PagedListOptions<Row>>) => usePagedList<Row>({ listKey: "test", ...props }), {
    initialProps: { rows, ...options },
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NuqsTestingAdapter searchParams={search} onUrlUpdate={(e) => updates.push(e)} hasMemory>
        {children}
      </NuqsTestingAdapter>
    ),
  });
}
const lastUrl = () => updates.at(-1)?.queryString ?? "";

describe("usePagedList — client mode", () => {
  it("slices the current page at the default size of 25", () => {
    const { result } = setup("");
    expect(result.current.pageSize).toBe(25);
    expect(result.current.pageCount).toBe(13);
    expect(result.current.pageRows.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("reads ?page= and ?per= from the URL", () => {
    const { result } = setup("?page=6&per=10");
    expect(result.current.page).toBe(6);
    expect(result.current.pageRows[0]).toEqual({ id: 51 });
    expect(result.current.pageRows).toHaveLength(10);
  });

  it("navigates by pushing ?page=", async () => {
    const { result } = setup("");
    act(() => result.current.setPage(4));
    await waitFor(() => expect(lastUrl()).toBe("?page=4"));
    expect(updates.at(-1)?.options.history).toBe("push");
    expect(result.current.pageRows[0]).toEqual({ id: 76 });
  });

  it("clamps a page past the end and fixes the URL", async () => {
    const { result } = setup("?page=99");
    expect(result.current.page).toBe(13);
    await waitFor(() => expect(lastUrl()).toBe("?page=13"));
  });

  it("ignores a page size that isn't offered", () => {
    const { result } = setup("?per=7");
    expect(result.current.pageSize).toBe(25);
  });

  it("changing the size keeps the first visible item and remembers the size", () => {
    const { result } = setup("?page=6"); // items 126–150
    act(() => result.current.setPageSize(50));
    expect(result.current.page).toBe(3); // 101–150 still shows item 126
    expect(result.current.pageSize).toBe(50);
    expect(localStorage.getItem("dd-per-page:test")).toBe("50");
  });

  it("uses the remembered size when the URL names none", () => {
    localStorage.setItem("dd-per-page:test", "100");
    const { result } = setup("");
    expect(result.current.pageSize).toBe(100);
    expect(result.current.pageCount).toBe(4);
  });

  it("prefixes URL keys when several lists share a page", async () => {
    const { result } = setup("?cases_page=2", { urlPrefix: "cases" });
    expect(result.current.page).toBe(2);
    act(() => result.current.setPage(3));
    await waitFor(() => expect(lastUrl()).toBe("?cases_page=3"));
  });
});

describe("usePagedList — server mode", () => {
  it("takes the total from the API and returns no rows of its own", () => {
    const { result } = setup("?page=2", { rows: undefined, total: 312 });
    expect(result.current.pageCount).toBe(13);
    expect(result.current.page).toBe(2);
    expect(result.current.offset).toBe(25);
    expect(result.current.pageRows).toEqual([]);
  });

  it("does not clamp before the total is known", () => {
    const { result } = setup("?page=9", { rows: undefined, total: undefined });
    expect(updates).toEqual([]);
    expect(result.current.page).toBe(1); // nothing to page yet
  });
});
