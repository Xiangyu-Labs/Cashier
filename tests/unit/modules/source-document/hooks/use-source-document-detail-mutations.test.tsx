import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentDetailMutations } from "@/modules/source-document/hooks/useSourceDocumentDetailMutations";

const {
  batchDeleteLedgerEntriesActionMock,
  updateLedgerEntryActionMock,
  updateSourceDocumentActionMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  updateLedgerEntryActionMock: vi.fn(),
  updateSourceDocumentActionMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  updateLedgerEntryAction: updateLedgerEntryActionMock,
  batchUpdateLedgerEntriesAction: vi.fn(),
  batchDeleteLedgerEntriesAction: batchDeleteLedgerEntriesActionMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  updateSourceDocumentAction: updateSourceDocumentActionMock,
}));

vi.mock("@/modules/source-document/hooks/useSourceDocumentRecordMutations", () => ({
  useSourceDocumentRecordMutations: () => ({
    deleteDocumentMutation: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/modules/source-document/hooks/revision-state-refresh", () => ({
  useNotifyRevisionRefresh: () => vi.fn(),
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
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

describe("useSourceDocumentDetailMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes multiple entries sequentially and runs one final refresh round", async () => {
    const { queryClient, wrapper } = setup();
    const firstWrite = deferred();
    const secondWrite = deferred();
    const refresh = deferred();
    updateLedgerEntryActionMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(() => refresh.promise);
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          onClose: vi.fn(),
        }),
      { wrapper }
    );

    let settled = false;
    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = result.current
        .saveChanges({}, [
          { id: "entry-1", data: { itemName: "First" } },
          { id: "entry-2", data: { itemName: "Second" } },
        ])
        .finally(() => {
          settled = true;
        });
    });

    await waitFor(() => expect(updateLedgerEntryActionMock).toHaveBeenCalledTimes(1));
    expect(updateLedgerEntryActionMock).toHaveBeenNthCalledWith(1, "ledger-1", "entry-1", {
      itemName: "First",
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => firstWrite.resolve());
    await waitFor(() => expect(updateLedgerEntryActionMock).toHaveBeenCalledTimes(2));
    expect(updateLedgerEntryActionMock).toHaveBeenNthCalledWith(2, "ledger-1", "entry-2", {
      itemName: "Second",
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => secondWrite.resolve());
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(5));
    expect(settled).toBe(false);
    for (const call of invalidate.mock.calls) {
      expect(call[1]).toEqual({ throwOnError: true });
    }

    await act(async () => {
      refresh.resolve();
      await savePromise;
    });
    expect(settled).toBe(true);
    expect(updateSourceDocumentActionMock).not.toHaveBeenCalled();
  });

  it("deletes selected entries in one batch and refreshes each affected resource once", async () => {
    const { queryClient, wrapper } = setup();
    batchDeleteLedgerEntriesActionMock.mockResolvedValue({
      succeededIds: ["entry-1", "entry-2"],
      skipped: [],
      failed: [],
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          onClose: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.batchDeleteEntries(["entry-1", "entry-2"])).resolves.toEqual([]);
    });

    expect(batchDeleteLedgerEntriesActionMock).toHaveBeenCalledOnce();
    expect(batchDeleteLedgerEntriesActionMock).toHaveBeenCalledWith("ledger-1", [
      "entry-1",
      "entry-2",
    ]);
    expect(invalidate).toHaveBeenCalledTimes(4);
    for (const call of invalidate.mock.calls) {
      expect(call[1]).toEqual({ throwOnError: true });
    }
  });
});
