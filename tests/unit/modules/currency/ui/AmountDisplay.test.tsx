import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmountDisplay } from "../../../../../src/modules/currency/ui/AmountDisplay";

const mockUseAmountDisplay = vi.hoisted(() => vi.fn());

vi.mock("@/modules/currency/client", () => ({
  useAmountDisplay: mockUseAmountDisplay,
}));

describe("AmountDisplay", () => {
  beforeEach(() => {
    mockUseAmountDisplay.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders converted amount with main currency and original hint", () => {
    mockUseAmountDisplay.mockReturnValue({
      displayAmount: 12.34,
      isDifferentCurrency: true,
      originalCurrency: "CNY",
    });

    render(
      <AmountDisplay amount={100} currency="CNY" mainCurrency="USD" date="2026-03-20" />
    );

    expect(mockUseAmountDisplay).toHaveBeenCalledWith({
      amount: 100,
      currency: "CNY",
      mainCurrency: "USD",
      date: "2026-03-20",
    });
    expect(screen.getByText("USD")).not.toBeNull();
    expect(screen.getByText("12.34")).not.toBeNull();
    expect(screen.getByText(/≈ CNY 100\.00/)).not.toBeNull();
  });

  it("hides original hint when showOriginal is false", () => {
    mockUseAmountDisplay.mockReturnValue({
      displayAmount: 12.34,
      isDifferentCurrency: true,
      originalCurrency: "CNY",
    });

    render(
      <AmountDisplay amount={100} currency="CNY" mainCurrency="USD" showOriginal={false} />
    );

    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("renders original currency when conversion is not needed", () => {
    mockUseAmountDisplay.mockReturnValue({
      displayAmount: 100,
      isDifferentCurrency: false,
      originalCurrency: "USD",
    });

    render(<AmountDisplay amount={100} currency="USD" mainCurrency="USD" />);

    expect(mockUseAmountDisplay).toHaveBeenCalledWith({
      amount: 100,
      currency: "USD",
      mainCurrency: "USD",
    });
    expect(screen.getByText("USD")).not.toBeNull();
    expect(screen.getByText("100.00")).not.toBeNull();
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
