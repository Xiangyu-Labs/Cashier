import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDetailsBatchController } from "@/modules/workspace/ui/useDetailsBatchController";

const {
  batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesActionMock,
  batchUpdateLedgerEntryDatesActionMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntryDatesActionMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  batchDeleteLedgerEntriesAction: batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesAction: batchUpdateLedgerEntriesActionMock,
  batchUpdateLedgerEntryDatesAction: batchUpdateLedgerEntryDatesActionMock,
  previewBatchLedgerEntryDateAction: vi.fn(),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useDetailsBatchController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes delete confirmation before refresh settles and stays pending", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    batchDeleteLedgerEntriesActionMock.mockResolvedValueOnce({
      succeededIds: ["entry-1"],
      skipped: [],
      failed: [],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1"], "fingerprint"),
      { wrapper }
    );

    act(() => {
      result.current.handleSelect("entry-1", true);
      result.current.setDeleteDialogOpen(true);
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.remove.mutateAsync();
    });

    await act(async () => Promise.resolve());
    expect(result.current.remove.isPending).toBe(true);
    expect(result.current.deleteDialogOpen).toBe(false);
    expect(result.current.selectedIds).toEqual([]);

    await act(async () => {
      refreshGate.resolve();
      await mutation;
    });
  });

  it("closes the date dialog before refresh settles and stays pending", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    batchUpdateLedgerEntryDatesActionMock.mockResolvedValueOnce({ affectedCount: 1 });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1"], "fingerprint"),
      { wrapper }
    );

    act(() => {
      result.current.handleSelect("entry-1", true);
      result.current.setDateDialogOpen(true);
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.updateDates.mutateAsync();
    });

    await act(async () => Promise.resolve());
    expect(result.current.updateDates.isPending).toBe(true);
    expect(result.current.dateDialogOpen).toBe(false);
    expect(result.current.selectedIds).toEqual([]);

    await act(async () => {
      refreshGate.resolve();
      await mutation;
    });
  });

  it("clears selection before refresh and keeps the batch update pending", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    batchUpdateLedgerEntriesActionMock.mockResolvedValueOnce({ affectedCount: 1 });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1"], "fingerprint"),
      { wrapper }
    );

    act(() => result.current.handleSelect("entry-1", true));
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.update.mutateAsync({ categoryId: "category-1" });
    });

    await act(async () => Promise.resolve());
    expect(result.current.update.isPending).toBe(true);
    expect(result.current.selectedIds).toEqual([]);

    await act(async () => {
      refreshGate.resolve();
      await mutation;
    });
  });
});
