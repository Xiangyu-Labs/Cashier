import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickEntryFormController } from "@/modules/source-document/hooks/useQuickEntryFormController";
import type { EntryCategory } from "@/modules/ledger/contracts";

const mutate = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: () => ({ mutate, isPending: false }),
}));

const categories = [
  {
    id: "cat-1",
    name: "Meals",
  } as EntryCategory,
];

describe("useQuickEntryFormController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T16:30:00.000Z"));
    mutate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the ledger time zone for the default civil date", () => {
    const { result } = renderHook(() =>
      useQuickEntryFormController({
        ledgerId: "ledger-1",
        categories,
        mainCurrency: "CNY",
        timeZone: "Asia/Shanghai",
      })
    );

    expect(result.current.entryDate).toBe("2026-07-28");
  });

  it("updates a late time zone only until the user edits the date", () => {
    const { result, rerender } = renderHook(
      ({ timeZone }: { timeZone: string | undefined }) =>
        useQuickEntryFormController({
          ledgerId: "ledger-1",
          categories,
          mainCurrency: "CNY",
          ...(timeZone != null ? { timeZone } : {}),
        }),
      { initialProps: { timeZone: undefined as string | undefined } }
    );

    rerender({ timeZone: "Asia/Shanghai" });
    expect(result.current.entryDate).toBe("2026-07-28");

    act(() => result.current.setEntryDate("2026-07-20"));
    rerender({ timeZone: "America/Los_Angeles" });
    expect(result.current.entryDate).toBe("2026-07-20");
  });

  it("submits a positive decimal amount with the unchanged date contract", () => {
    const { result } = renderHook(() =>
      useQuickEntryFormController({
        ledgerId: "ledger-1",
        categories,
        mainCurrency: "CNY",
        timeZone: "Asia/Shanghai",
      })
    );

    act(() => {
      result.current.setSelectedCategoryId("cat-1");
      result.current.setAmount("12.34");
      result.current.setEntryDate("2026-07-20");
    });
    act(() => result.current.handleSubmit());

    expect(mutate).toHaveBeenCalledWith({
      categoryId: "cat-1",
      amount: 12.34,
      currency: "CNY",
      entryDate: "2026-07-20",
    });
  });
});
