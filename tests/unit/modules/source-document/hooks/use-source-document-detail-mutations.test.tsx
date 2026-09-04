import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocumentDetailMutations } from "@/modules/source-document/hooks/useSourceDocumentDetailMutations";

const { saveMock, splitMock, createEntryMock, deleteEntryMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  splitMock: vi.fn(),
  createEntryMock: vi.fn(),
  deleteEntryMock: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/modules/ledger/actions", () => ({
  createLedgerEntryAction: createEntryMock,
  deleteLedgerEntryAction: deleteEntryMock,
  batchUpdateLedgerEntriesAction: vi.fn(),
  batchDeleteLedgerEntriesAction: vi.fn(),
}));
vi.mock("@/modules/source-document/actions", () => ({
  saveSourceDocumentChangesAction: saveMock,
  splitSourceDocumentAction: splitMock,
}));
vi.mock("@/modules/source-document/hooks/useSourceDocumentRecordMutations", () => ({
  useSourceDocumentRecordMutations: () => ({ deleteDocumentMutation: { mutateAsync: vi.fn() } }),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useSourceDocumentDetailMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends canonical entry patches with the snapshot version", async () => {
    const { client, wrapper } = setup();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    saveMock.mockResolvedValue({
      ok: true,
      sourceDocumentId: "source-1",
      version: 8,
      data: { updatedEntryIds: [] },
    });
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          version: 7,
          onClose: vi.fn(),
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.saveChanges({
        expectedVersion: 7,
        changes: {
          sourceDoc: { title: "Updated" },
          entries: { "entry-2": { itemName: "Second" }, "entry-1": { itemName: "First" } },
        },
      });
    });
    expect(saveMock).toHaveBeenCalledWith("ledger-1", {
      sourceDocumentId: "source-1",
      expectedVersion: 7,
      sourceDocument: { title: "Updated" },
      entries: [
        { ledgerEntryId: "entry-1", data: { itemName: "First" } },
        { ledgerEntryId: "entry-2", data: { itemName: "Second" } },
      ],
    });
  });

  it("passes only versioned split business input", async () => {
    const { client, wrapper } = setup();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    splitMock.mockResolvedValue({
      ok: true,
      sourceDocumentId: "source-1",
      version: 8,
      data: { splitSourceDocumentId: "source-2", splitVersion: 1, movedEntryCount: 1 },
    });
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          version: 7,
          onClose: vi.fn(),
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.splitEntries({
        expectedVersion: 7,
        ledgerEntryIds: ["entry-1"],
        entryDate: "2026-08-16",
      });
    });
    expect(splitMock).toHaveBeenCalledWith("ledger-1", {
      sourceDocumentId: "source-1",
      expectedVersion: 7,
      ledgerEntryIds: ["entry-1"],
      entryDate: "2026-08-16",
    });
    await expect(
      result.current.splitEntries({
        expectedVersion: 7,
        ledgerEntryIds: ["entry-1"],
        entryDate: "2026-08-16",
      })
    ).resolves.toEqual({
      splitSourceDocumentId: "source-2",
      splitVersion: 1,
      movedEntryCount: 1,
    });
  });

  it.each([
    [
      "save",
      saveMock,
      (result: ReturnType<typeof useSourceDocumentDetailMutations>) =>
        result.saveChanges({
          expectedVersion: 7,
          changes: { sourceDoc: { title: "Updated" }, entries: {} },
        }),
    ],
    [
      "split",
      splitMock,
      (result: ReturnType<typeof useSourceDocumentDetailMutations>) =>
        result.splitEntries({
          expectedVersion: 7,
          ledgerEntryIds: ["entry-1"],
          entryDate: "2026-08-16",
        }),
    ],
    [
      "add entry",
      createEntryMock,
      (result: ReturnType<typeof useSourceDocumentDetailMutations>) =>
        result.addEntry({ itemName: "Lunch", amount: 12 }),
    ],
    [
      "delete entry",
      deleteEntryMock,
      (result: ReturnType<typeof useSourceDocumentDetailMutations>) =>
        result.deleteEntry("entry-1"),
    ],
  ])("rejects stale %s results", async (_label, actionMock, run) => {
    const { wrapper } = setup();
    actionMock.mockResolvedValue({
      ok: false,
      reason: "stale",
      sourceDocumentId: "source-1",
      expectedVersion: 7,
      currentVersion: 8,
    });
    const { result } = renderHook(
      () =>
        useSourceDocumentDetailMutations({
          id: "source-1",
          ledgerId: "ledger-1",
          version: 7,
          onClose: vi.fn(),
        }),
      { wrapper }
    );

    await expect(run(result.current)).rejects.toMatchObject({
      code: "SOURCE_DOCUMENT_STALE",
    });
  });
});
