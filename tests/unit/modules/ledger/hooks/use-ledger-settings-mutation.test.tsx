import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLedgerSettingsMutation } from "@/modules/ledger/hooks/useLedgerSettingsMutation";
import type { Ledger } from "@/modules/ledger/contracts";

const { updateLedgerAction, toastError } = vi.hoisted(() => ({
  updateLedgerAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/modules/ledger/actions", () => ({ updateLedgerAction }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  metadata: { settings: { currencies: ["USD", "CNY"] } },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useLedgerSettingsMutation({
        ledgerId: "ledger-1",
        successMessage: "saved",
        errorMessage: "failed",
      }),
    { wrapper }
  );
  return { ...hook, invalidate };
}

describe("useLedgerSettingsMutation", () => {
  it("submits preferred currencies through the currencies field", async () => {
    updateLedgerAction.mockResolvedValueOnce({ ok: true, ledger });
    const { result } = setup();

    await act(async () => result.current.mutateAsync({ currencies: ["USD", "CNY"] }));

    expect(updateLedgerAction).toHaveBeenCalledWith("ledger-1", {
      settings: { currencies: ["USD", "CNY"] },
    });
  });

  it("localizes action failures and does not invalidate queries", async () => {
    updateLedgerAction.mockResolvedValueOnce({ ok: false, code: "rates_unavailable" });
    const { result, invalidate } = setup();

    await act(async () => {
      await expect(result.current.mutateAsync({ mainCurrency: "USD" })).rejects.toThrow(
        "缺少部分交易日的历史汇率，主货币未更改"
      );
    });

    expect(toastError).toHaveBeenCalledWith("缺少部分交易日的历史汇率，主货币未更改");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
