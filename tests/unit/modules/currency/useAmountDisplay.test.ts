import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAmountDisplay } from "@/modules/currency/useAmountDisplay";

const mockUseConvertedAmount = vi.hoisted(() => vi.fn());

vi.mock("@/modules/currency/useConvertedAmount", () => ({
  useConvertedAmount: mockUseConvertedAmount,
}));

describe("useAmountDisplay", () => {
  beforeEach(() => {
    mockUseConvertedAmount.mockReset();
    mockUseConvertedAmount.mockReturnValue({
      converted: 42,
      isLoading: false,
      error: null,
    });
  });

  it("uses converted value for different currencies and forwards date", () => {
    const result = useAmountDisplay({
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
      date: "2026-03-20",
    });

    expect(mockUseConvertedAmount).toHaveBeenCalledWith(100, "CNY", "USD", "2026-03-20");
    expect(result).toEqual({
      converted: 42,
      displayAmount: 42,
      isDifferentCurrency: true,
      isLoading: false,
      originalCurrency: "CNY",
      mainCurrency: "USD",
    });
  });

  it("keeps original amount when currencies are equal", () => {
    const result = useAmountDisplay({
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
      amount: 50,
      currency: "unknown",
      mainCurrency: "USD",
    });
    const missing = useAmountDisplay({
      amount: 50,
      currency: null,
      mainCurrency: "USD",
    });

    expect(unknown.isDifferentCurrency).toBe(false);
    expect(unknown.displayAmount).toBe(50);
    expect(unknown.originalCurrency).toBe("unknown");

    expect(missing.isDifferentCurrency).toBe(false);
    expect(missing.displayAmount).toBe(50);
    expect(missing.originalCurrency).toBe("?");
  });
});
