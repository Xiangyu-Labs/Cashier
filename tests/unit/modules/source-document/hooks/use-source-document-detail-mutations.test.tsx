import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentDetailMutations } from "@/modules/source-document/hooks/useSourceDocumentDetailMutations";

const {
  batchDeleteLedgerEntriesActionMock,
  saveSourceDocumentChangesActionMock,
  splitSourceDocumentActionMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  saveSourceDocumentChangesActionMock: vi.fn(),
  splitSourceDocumentActionMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  batchUpdateLedgerEntriesAction: vi.fn(),
  batchDeleteLedgerEntriesAction: batchDeleteLedgerEntriesActionMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  saveSourceDocumentChangesAction: saveSourceDocumentChangesActionMock,
  splitSourceDocumentAction: splitSourceDocumentActionMock,
}));

vi.mock("@/modules/source-document/hooks/useSourceDocumentRecordMutations", () => ({
  useSourceDocumentRecordMutations: () => ({
    deleteDocumentMutation: { mutateAsync: vi.fn() },
  }),
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

  it("updates the current detail and remains pending until invalidation settles", async () => {
    const { queryClient, wrapper } = setup();
    const write = deferred<{
      sourceDocument: { id: string };
      ledgerEntries: Array<{ id: string }>;
    }>();
    const refresh = deferred();
    saveSourceDocumentChangesActionMock.mockImplementation(() => write.promise);
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
        .saveChanges({
          expectedRevisionId: "revision-1",
          operationId: "operation-1",
          changes: {
            sourceDoc: { title: "Updated" },
            entries: {
              "entry-1": { itemName: "First" },
              "entry-2": { itemName: "Second" },
            },
          },
        })
        .finally(() => {
          settled = true;
        });
    });

    await waitFor(() => expect(saveSourceDocumentChangesActionMock).toHaveBeenCalledOnce());
    expect(saveSourceDocumentChangesActionMock).toHaveBeenCalledWith("ledger-1", {
      sourceDocumentId: "source-1",
      expectedRevisionId: "revision-1",
      operationId: "operation-1",
      sourceDocument: { title: "Updated" },
      entries: [
        { ledgerEntryId: "entry-1", data: { itemName: "First" } },
        { ledgerEntryId: "entry-2", data: { itemName: "Second" } },
      ],
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      write.resolve({
        sourceDocument: { id: "source-1" },
        ledgerEntries: [{ id: "entry-1" }, { id: "entry-2" }],
      });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    expect(result.current.isSavingChanges).toBe(true);
    expect(
      queryClient.getQueryData(["ledger", "ledger-1", "source-document", "source-1", "detail"])
    ).toEqual({ id: "source-1" });

    await act(async () => {
      refresh.resolve();
      await savePromise;
    });
    await waitFor(() => expect(result.current.isSavingChanges).toBe(false));
    expect(settled).toBe(true);
  });

  it("sends entry patches in canonical ID order", async () => {
    const { queryClient, wrapper } = setup();
    saveSourceDocumentChangesActionMock.mockResolvedValue({
      sourceDocument: { id: "source-1" },
      ledgerEntries: [],
    });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
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
      await result.current.saveChanges({
        expectedRevisionId: "revision-1",
        operationId: "operation-1",
        changes: {
          sourceDoc: {},
          entries: {
            "entry-2": { itemName: "Second" },
            "entry-1": { itemName: "First" },
          },
        },
      });
    });

    expect(saveSourceDocumentChangesActionMock).toHaveBeenCalledWith(
      "ledger-1",
      expect.objectContaining({
        entries: [
          { ledgerEntryId: "entry-1", data: { itemName: "First" } },
          { ledgerEntryId: "entry-2", data: { itemName: "Second" } },
        ],
      })
    );
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
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("updates only the currently open detail after a split", async () => {
    const { queryClient, wrapper } = setup();
    splitSourceDocumentActionMock.mockResolvedValue({
      sourceDocumentId: "source-1",
      splitSourceDocumentId: "source-2",
      sourceDocument: { id: "source-1", title: "Original" },
      splitSourceDocument: { id: "source-2", title: "Split" },
    });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          onClose: vi.fn(),
        }),
      { wrapper }
    );
    const input = {
      expectedRevisionId: "revision-1",
      operationId: "operation-1",
      newSourceDocumentId: "source-2",
      ledgerEntryIds: ["entry-1"],
      entryDate: "2026-08-16",
    };

    await act(async () => {
      await result.current.splitEntries(input);
    });

    expect(splitSourceDocumentActionMock).toHaveBeenCalledWith("ledger-1", {
      sourceDocumentId: "source-1",
      ...input,
    });
    expect(
      queryClient.getQueryData(["ledger", "ledger-1", "source-document", "source-1", "detail"])
    ).toEqual({ id: "source-1", title: "Original" });
    expect(
      queryClient.getQueryData(["ledger", "ledger-1", "source-document", "source-2", "detail"])
    ).toBeUndefined();
  });
});
