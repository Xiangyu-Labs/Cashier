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
  toastErrorMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntryDatesActionMock: vi.fn(),
  previewBatchLedgerEntryDateActionMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: toastErrorMock, warning: vi.fn() },
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

function entry(id: string, sourceDocumentId = "document-1") {
  return {
    id,
    ledgerId: "ledger-1",
    categoryId: null,
    sourceDocumentId,
    amount: "1",
    currency: "CNY",
    itemName: id,
    description: null,
    convertedAmount: "1",
    exchangeRate: "1",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    deletedAt: null,
    sourceDocument: {
      id: sourceDocumentId,
      version: 1,
      ledgerId: "ledger-1",
      title: null,
      status: "completed" as const,
      type: "manual" as const,
      entryDate: "2026-09-04",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  };
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
      succeeded: [{ id: "entry-1", sourceDocumentId: "document-1", version: 2 }],
      stale: [],
      failed: [],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", [entry("entry-1")], "fingerprint"),
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
    batchUpdateLedgerEntryDatesActionMock.mockResolvedValueOnce({
      ok: true,
      versions: [{ sourceDocumentId: "document-1", version: 2 }],
      data: { impact: { affectedEntryCount: 1 } },
    });
    previewBatchLedgerEntryDateActionMock.mockResolvedValueOnce({
      selectedEntryCount: 1,
      sourceDocumentCount: 0,
      affectedEntryCount: 1,
      sourceDocumentIds: [],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", [entry("entry-1")], "fingerprint"),
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
    batchUpdateLedgerEntriesActionMock.mockResolvedValueOnce({
      ok: true,
      versions: [{ sourceDocumentId: "document-1", version: 2 }],
      data: { ledgerEntryIds: ["entry-1"], affectedCount: 1 },
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", [entry("entry-1")], "fingerprint"),
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
    batchUpdateLedgerEntryDatesActionMock.mockResolvedValueOnce({
      ok: true,
      versions: [{ sourceDocumentId: "document-1", version: 2 }],
      data: { impact: { affectedEntryCount: 2 } },
    });
    const { result } = renderHook(
      () =>
        useDetailsBatchController("ledger-1", [entry("entry-1"), entry("entry-2")], "fingerprint"),
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
      [{ sourceDocumentId: "document-1", expectedVersion: 1 }],
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
      () =>
        useDetailsBatchController("ledger-1", [entry("entry-1"), entry("entry-2")], "fingerprint"),
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

  it("keeps selection when an atomic batch update is stale", async () => {
    const { wrapper } = setup();
    batchUpdateLedgerEntriesActionMock.mockResolvedValueOnce({
      ok: false,
      reason: "stale",
      staleTargets: [{ sourceDocumentId: "document-1", expectedVersion: 1, currentVersion: 2 }],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", [entry("entry-1")], "fingerprint"),
      { wrapper }
    );
    act(() => result.current.handleSelect("entry-1", true));

    await expect(
      result.current.update.mutateAsync({ categoryId: "category-1" })
    ).rejects.toMatchObject({ code: "SOURCE_DOCUMENT_STALE" });

    expect(result.current.selectedIds).toEqual(["entry-1"]);
    expect(toastErrorMock).toHaveBeenCalledWith("error");
  });

  it("keeps the date dialog and selection when confirmation is stale", async () => {
    const { wrapper } = setup();
    previewBatchLedgerEntryDateActionMock.mockResolvedValueOnce({
      selectedEntryCount: 1,
      sourceDocumentCount: 1,
      affectedEntryCount: 1,
      sourceDocumentIds: ["document-1"],
    });
    batchUpdateLedgerEntryDatesActionMock.mockResolvedValueOnce({
      ok: false,
      reason: "stale",
      staleTargets: [{ sourceDocumentId: "document-1", expectedVersion: 1, currentVersion: 2 }],
    });
    const { result } = renderHook(
      () => useDetailsBatchController("ledger-1", [entry("entry-1")], "fingerprint"),
      { wrapper }
    );
    act(() => result.current.handleSelect("entry-1", true));
    await act(async () => result.current.previewDate.mutateAsync());

    await expect(result.current.updateDates.mutateAsync()).rejects.toMatchObject({
      code: "SOURCE_DOCUMENT_STALE",
    });

    expect(result.current.dateDialogOpen).toBe(true);
    expect(result.current.selectedIds).toEqual(["entry-1"]);
  });
});
