import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";

const { updateLedgerEntryActionMock, deleteLedgerEntryActionMock, toastSuccessMock } = vi.hoisted(
  () => ({
    updateLedgerEntryActionMock: vi.fn(),
    deleteLedgerEntryActionMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  })
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  updateLedgerEntryAction: updateLedgerEntryActionMock,
  deleteLedgerEntryAction: deleteLedgerEntryActionMock,
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

describe("useLedgerEntriesMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases update pending state before derived queries settle", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    updateLedgerEntryActionMock.mockResolvedValueOnce({ id: "entry-1" });
    const { result } = renderHook(() => useLedgerEntriesMutations("ledger-1", []), { wrapper });

    await act(async () => {
      await expect(
        result.current.updateEntry.mutateAsync({
          ledgerEntryId: "entry-1",
          data: { itemName: "Dinner" },
        })
      ).resolves.toEqual({ id: "entry-1" });
    });

    expect(result.current.updateEntry.isPending).toBe(false);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(5);

    await act(async () => refreshGate.resolve());
  });

  it("shows delete success before derived queries settle", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    deleteLedgerEntryActionMock.mockResolvedValueOnce({ sourceDocumentDeleted: false });
    const { result } = renderHook(() => useLedgerEntriesMutations("ledger-1", []), { wrapper });

    await act(async () => {
      await result.current.deleteEntry.mutateAsync("entry-1");
    });

    expect(result.current.deleteEntry.isPending).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("deleteSuccess");

    await act(async () => refreshGate.resolve());
  });
});
