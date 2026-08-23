import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useModalStackStore } from "@/lib/store/modal-stack";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";

const getLedgerEntryAction = vi.fn();
const updateLedgerEntryAction = vi.fn();
const deleteLedgerEntryAction = vi.fn();

const modalProps: {
  ledgerEntry: LedgerEntry | null;
  isLoading: boolean;
  loadError: boolean;
  onReload: (() => Promise<void>) | undefined;
} = { ledgerEntry: null, isLoading: true, loadError: false, onReload: undefined };

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/get-entry", () => ({
  getLedgerEntryAction: (...args: unknown[]) => getLedgerEntryAction(...args),
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  updateLedgerEntryAction: (...args: unknown[]) =>
    updateLedgerEntryAction(...args, crypto.randomUUID()),
  deleteLedgerEntryAction: (...args: unknown[]) =>
    deleteLedgerEntryAction(...args, crypto.randomUUID()),
}));

vi.mock("@/modules/ledger/ui/LedgerEntryDetailModal", () => ({
  LedgerEntryDetailModal: ({ ledgerEntry, isLoading, loadError, onReload }: typeof modalProps) => {
    modalProps.ledgerEntry = ledgerEntry;
    modalProps.isLoading = isLoading;
    modalProps.loadError = loadError;
    modalProps.onReload = onReload;
    return (
      <div>
        {loadError ? (
          <button onClick={() => void onReload?.()}>retry-detail</button>
        ) : isLoading ? (
          "loading"
        ) : (
          (ledgerEntry?.itemName ?? "missing")
        )}
      </div>
    );
  },
}));

const ledger2Entry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-2",
  categoryId: null,
  sourceDocumentId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "From ledger 2",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
  deletedAt: null,
};

const ledger1Entry: LedgerEntry = {
  ...ledger2Entry,
  ledgerId: "ledger-1",
  itemName: "From ledger 1",
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("LedgerEntryDetailWrapper ledger isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modalProps.ledgerEntry = null;
    modalProps.isLoading = true;
    modalProps.loadError = false;
    modalProps.onReload = undefined;
    useModalStackStore.setState({ stack: [], canGoBack: false });
    getLedgerEntryAction.mockResolvedValue(ledger1Entry);
  });

  it("does not read another ledger's cached entry for the same entity id", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.ledgerEntry("ledger-2", "entry-1"), ledger2Entry);

    const view = render(
      <LedgerEntryDetailWrapper
        id="entry-1"
        ledgerId="ledger-1"
        open
        onClose={vi.fn()}
        categories={[]}
        mainCurrency="CNY"
        preferredCurrencies={[]}
      />,
      { wrapper: createWrapper(queryClient) }
    );

    expect(view.getByText("loading")).toBeTruthy();
    expect(getLedgerEntryAction).toHaveBeenCalledWith("ledger-1", "entry-1");

    await waitFor(() => expect(view.getByText("From ledger 1")).toBeTruthy());
    expect(modalProps.isLoading).toBe(false);
    expect(queryClient.getQueryData(queryKeys.ledgerEntry("ledger-2", "entry-1"))).toEqual(
      ledger2Entry
    );
  });

  it("reuses the ledger-scoped cache when the same ledger reopens the entry", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.ledgerEntry("ledger-1", "entry-1"), ledger1Entry);

    const view = render(
      <LedgerEntryDetailWrapper
        id="entry-1"
        ledgerId="ledger-1"
        open
        onClose={vi.fn()}
        categories={[]}
        mainCurrency="CNY"
        preferredCurrencies={[]}
      />,
      { wrapper: createWrapper(queryClient) }
    );

    expect(view.getByText("From ledger 1")).toBeTruthy();
  });

  it("keeps the modal open after a load error and supports an in-place retry", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    getLedgerEntryAction
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce(ledger1Entry);

    const view = render(
      <LedgerEntryDetailWrapper
        id="entry-1"
        ledgerId="ledger-1"
        open
        onClose={onClose}
        categories={[]}
        mainCurrency="CNY"
        preferredCurrencies={[]}
      />,
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(view.getByText("retry-detail")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();

    view.getByText("retry-detail").click();
    await waitFor(() => expect(view.getByText("From ledger 1")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats a successful null result as a load error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    getLedgerEntryAction.mockResolvedValueOnce(null);

    const view = render(
      <LedgerEntryDetailWrapper
        id="entry-1"
        ledgerId="ledger-1"
        open
        onClose={onClose}
        categories={[]}
        mainCurrency="CNY"
        preferredCurrencies={[]}
      />,
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(view.getByText("retry-detail")).toBeTruthy());
    expect(modalProps.ledgerEntry).toBeNull();
    expect(modalProps.isLoading).toBe(false);
    expect(modalProps.loadError).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
