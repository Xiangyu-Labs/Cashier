import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const {
  batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesActionMock,
  submitBatchCategorizeActionMock,
  mutationOptions,
  useLedgerMutationMock,
  toastSuccessMock,
  toastInfoMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntriesActionMock: vi.fn(),
  submitBatchCategorizeActionMock: vi.fn(),
  mutationOptions: [] as Array<Record<string, unknown>>,
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: Record<string, unknown>) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
  toastSuccessMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count != null ? `${key}:${values.count}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    info: toastInfoMock,
  },
}));

vi.mock("@/lib/mutations", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  batchUpdateLedgerEntriesAction: batchUpdateLedgerEntriesActionMock,
  batchDeleteLedgerEntriesAction: batchDeleteLedgerEntriesActionMock,
  submitBatchCategorizeAction: submitBatchCategorizeActionMock,
}));

import { useBatchEntryActions } from "./useBatchEntryActions";

function getOption(index: number) {
  const option = mutationOptions[index];
  if (option == null) {
    throw new Error(`Missing mutation option ${index}`);
  }
  return option;
}

describe("useBatchEntryActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.length = 0;
    submitBatchCategorizeActionMock.mockResolvedValue({ submittedCount: 2, skippedCount: 1 });
  });

  it("registers four mutations", () => {
    renderHook(() => useBatchEntryActions("ledger-1", vi.fn()));
    expect(useLedgerMutationMock).toHaveBeenCalledTimes(4);
  });

  it("submits batch categorize and clears selection with toast feedback", async () => {
    const clearSelection = vi.fn();
    renderHook(() => useBatchEntryActions("ledger-1", clearSelection));
    const batchCategorize = getOption(0);

    const result = await (batchCategorize.mutationFn as (ids: string[]) => Promise<unknown>)([
      "entry-1",
      "entry-2",
    ]);
    (batchCategorize.onSuccessExtra as (result: { submittedCount: number; skippedCount: number }) => void)({
      submittedCount: 2,
      skippedCount: 1,
    });

    expect(result).toEqual({ submittedCount: 2, skippedCount: 1 });
    expect(submitBatchCategorizeActionMock).toHaveBeenCalledWith("ledger-1", ["entry-1", "entry-2"]);
    expect(toastSuccessMock).toHaveBeenCalledWith("aiCategorizeSubmitted:2");
    expect(toastInfoMock).toHaveBeenCalledWith("aiCategorizeSkipped:1");
    expect(clearSelection).toHaveBeenCalled();
  });

  it("updates categories/currency and deletes entries through their action wrappers", async () => {
    const clearSelection = vi.fn();
    renderHook(() => useBatchEntryActions("ledger-1", clearSelection));

    const batchChangeCategory = getOption(1);
    const batchChangeCurrency = getOption(2);
    const batchDelete = getOption(3);

    await (batchChangeCategory.mutationFn as (input: {
      ids: string[];
      categoryId: string | null;
    }) => Promise<void>)({
      ids: ["entry-1", "entry-2"],
      categoryId: "cat-1",
    });
    (batchChangeCategory.onSuccessExtra as (data: unknown, variables: { ids: string[] }) => void)(
      undefined,
      { ids: ["entry-1", "entry-2"] }
    );

    await (batchChangeCurrency.mutationFn as (input: {
      ids: string[];
      currency: string;
    }) => Promise<void>)({
      ids: ["entry-3"],
      currency: "USD",
    });

    await (batchDelete.mutationFn as (ids: string[]) => Promise<void>)(["entry-4", "entry-5"]);
    (batchDelete.onSuccessExtra as (data: unknown, ids: string[]) => void)(undefined, [
      "entry-4",
      "entry-5",
    ]);

    expect(batchUpdateLedgerEntriesActionMock).toHaveBeenCalledWith("ledger-1", ["entry-1", "entry-2"], {
      categoryId: "cat-1",
    });
    expect(batchUpdateLedgerEntriesActionMock).toHaveBeenCalledWith("ledger-1", ["entry-3"], {
      currency: "USD",
    });
    expect(batchDeleteLedgerEntriesActionMock).toHaveBeenCalledWith("ledger-1", ["entry-4", "entry-5"]);
    expect(clearSelection).toHaveBeenCalledTimes(2);
  });
});
