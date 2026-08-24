import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDetailsBatchController } from "@/modules/workspace/ui/useDetailsBatchController";

const {
  batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesActionMock,
  batchUpdateLedgerEntryDatesActionMock,
  previewBatchLedgerEntryDateActionMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntryDatesActionMock: vi.fn(),
  previewBatchLedgerEntryDateActionMock: vi.fn(),
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
  previewBatchLedgerEntryDateAction: previewBatchLedgerEntryDateActionMock,
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
    previewBatchLedgerEntryDateActionMock.mockResolvedValueOnce({
      selectedEntryCount: 1,
      sourceDocumentCount: 0,
      affectedEntryCount: 1,
      sourceDocumentIds: [],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1"], "fingerprint"),
      { wrapper }
    );

    act(() => {
      result.current.handleSelect("entry-1", true);
    });
    await act(async () => result.current.previewDate.mutateAsync());
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

  it("confirms a date preview while its captured selection is unchanged", async () => {
    const { wrapper } = setup();
    previewBatchLedgerEntryDateActionMock.mockResolvedValueOnce({
      selectedEntryCount: 2,
      sourceDocumentCount: 1,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1"],
    });
    batchUpdateLedgerEntryDatesActionMock.mockResolvedValueOnce({ affectedCount: 2 });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1", "entry-2"], "fingerprint"),
      { wrapper }
    );

    act(() => {
      result.current.handleSelect("entry-1", true);
      result.current.handleSelect("entry-2", true);
    });
    await act(async () => {
      await result.current.previewDate.mutateAsync();
    });
    expect(previewBatchLedgerEntryDateActionMock).toHaveBeenCalledWith("ledger-1", [
      "entry-1",
      "entry-2",
    ]);

    await act(async () => {
      await result.current.updateDates.mutateAsync();
    });
    expect(batchUpdateLedgerEntryDatesActionMock).toHaveBeenCalledWith(
      "ledger-1",
      ["entry-1", "entry-2"],
      result.current.selectedDate
    );
  });

  it("rejects confirmation when selection changes after date preview", async () => {
    const { wrapper } = setup();
    previewBatchLedgerEntryDateActionMock.mockResolvedValueOnce({
      selectedEntryCount: 2,
      sourceDocumentCount: 1,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1"],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", ["entry-1", "entry-2"], "fingerprint"),
      { wrapper }
    );

    act(() => {
      result.current.handleSelect("entry-1", true);
      result.current.handleSelect("entry-2", true);
    });
    await act(async () => result.current.previewDate.mutateAsync());
    act(() => result.current.handleSelect("entry-2", false));

    await expect(result.current.updateDates.mutateAsync()).rejects.toThrow("selection_changed");
    expect(batchUpdateLedgerEntryDatesActionMock).not.toHaveBeenCalled();
  });
});
