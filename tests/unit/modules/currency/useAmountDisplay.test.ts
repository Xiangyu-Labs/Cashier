import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAmountDisplay } from "@/modules/currency/hooks/useAmountDisplay";

const mockUseConvertedAmount = vi.hoisted(() => vi.fn());

vi.mock("@/modules/currency/hooks/useConvertedAmount", () => ({
  useConvertedAmount: mockUseConvertedAmount,
}));

describe("useAmountDisplay", () => {
  const ledgerId = "10000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    mockUseConvertedAmount.mockReset();
    mockUseConvertedAmount.mockReturnValue({
      status: "success",
      converted: 42,
    });
  });

  it("uses converted value for different currencies and forwards date", () => {
    const result = useAmountDisplay({
      ledgerId,
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
      date: "2026-03-20",
    });

    expect(mockUseConvertedAmount).toHaveBeenCalledWith(ledgerId, 100, "CNY", "USD", "2026-03-20", {
      enabled: true,
    });
    expect(result).toEqual({
      converted: 42,
      displayAmount: 42,
      isDifferentCurrency: true,
      status: "success",
      isLoading: false,
      isError: false,
      originalCurrency: "CNY",
      mainCurrency: "USD",
    });
  });

  it("uses the persisted converted amount and skips the live query", () => {
    const result = useAmountDisplay({
      ledgerId,
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
      date: "2026-03-20",
      persistedConvertedAmount: "13.33",
    });

    expect(result).toEqual({
      converted: 13.33,
      displayAmount: 13.33,
      isDifferentCurrency: true,
      status: "success",
      isLoading: false,
      isError: false,
      originalCurrency: "CNY",
      mainCurrency: "USD",
    });
    expect(mockUseConvertedAmount).toHaveBeenCalledWith(ledgerId, 100, "CNY", "USD", "2026-03-20", {
      enabled: false,
    });
  });

  it("shows the original amount while conversion is loading", () => {
    mockUseConvertedAmount.mockReturnValue({ status: "loading", converted: null });

    const result = useAmountDisplay({
      ledgerId,
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
    });

    expect(result).toEqual({
      converted: null,
      displayAmount: 100,
      isDifferentCurrency: true,
      status: "loading",
      isLoading: true,
      isError: false,
      originalCurrency: "CNY",
      mainCurrency: "USD",
    });
  });

  it("shows the original amount after conversion failure", () => {
    mockUseConvertedAmount.mockReturnValue({
      status: "error",
      converted: null,
      error: new Error("rates unavailable"),
    });

    const result = useAmountDisplay({
      ledgerId,
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
    });

    expect(result).toMatchObject({
      converted: null,
      displayAmount: 100,
      isDifferentCurrency: true,
      status: "error",
      isLoading: false,
      isError: true,
      originalCurrency: "CNY",
    });
  });

  it("keeps original amount when currencies are equal", () => {
    const result = useAmountDisplay({
      ledgerId,
      amount: 88,
      currency: "USD",
      mainCurrency: "USD",
    });

    expect(result.displayAmount).toBe(88);
    expect(result.isDifferentCurrency).toBe(false);
    expect(result.originalCurrency).toBe("USD");
  });

  it("does not treat unknown or null currency as different", () => {
    const unknown = useAmountDisplay({
      ledgerId,
      amount: 50,
      currency: "unknown",
      mainCurrency: "USD",
    });
    const missing = useAmountDisplay({
      ledgerId,
      amount: 50,
      currency: null,
      mainCurrency: "USD",
    });

    expect(unknown.isDifferentCurrency).toBe(false);
    expect(unknown.displayAmount).toBe(50);
    expect(unknown.status).toBe("idle");
    expect(unknown.originalCurrency).toBe("unknown");

    expect(missing.isDifferentCurrency).toBe(false);
    expect(missing.displayAmount).toBe(50);
    expect(missing.status).toBe("idle");
    expect(missing.originalCurrency).toBe("?");
  });
});
