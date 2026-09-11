import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryHeader } from "@/modules/ledger/ui/LedgerEntryViewDetails/components/EntryHeader";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh-CN",
}));

function renderHeader(overrides: Partial<React.ComponentProps<typeof EntryHeader>> = {}) {
  return render(
    <EntryHeader
      itemName="Lunch"
      amount={12}
      currency="CNY"
      preferredCurrencies={["CNY"]}
      displayAmount="12"
      displayCurrency="CNY"
      isDifferentCurrency={false}
      showOriginalAmount={false}
      onFieldChange={vi.fn()}
      {...overrides}
    />
  );
}

describe("EntryHeader", () => {
  it("does not repeat the category icon, which the metadata block already labels", () => {
    // Regression: the header rendered a 56px category tile while the metadata
    // block below carried a "category" row with the same icon and name.
    const { container } = renderHeader();

    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("keeps the icon-sized spacer so the title stays aligned", () => {
    const { container } = renderHeader();

    const spacer = container.querySelector('[aria-hidden="true"].h-12');
    expect(spacer).toBeInTheDocument();
  });

  it("shows a single amount for an entry already in the main currency", () => {
    renderHeader({ disabled: true });

    expect(screen.getByText("¥12.00")).toBeInTheDocument();
    expect(screen.queryByText((text) => text.startsWith("≈"))).not.toBeInTheDocument();
  });

  it("stacks the converted amount above the original, like the stream rows", () => {
    renderHeader({
      amount: 7.9,
      currency: "MYR",
      displayAmount: "13.02",
      displayCurrency: "CNY",
      isDifferentCurrency: true,
      showOriginalAmount: true,
      disabled: true,
    });

    const converted = screen.getByText("¥13.02");
    expect(converted).toHaveClass("text-base", "font-semibold");

    const original = screen.getByText((text) => text.startsWith("≈"));
    expect(original).toHaveClass("text-xs", "text-muted-foreground");
    expect(original.textContent).toContain("MYR");

    // The original sits below the converted amount.
    expect(
      converted.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps the live converted amount above the editable original while editing", () => {
    renderHeader({
      amount: 7.9,
      currency: "MYR",
      displayAmount: "13.02",
      displayCurrency: "CNY",
      isDifferentCurrency: true,
      showOriginalAmount: true,
    });

    expect(screen.getByText("¥13.02")).toBeInTheDocument();
    expect(screen.getByText("≈")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "currency" })).toBeInTheDocument();
  });

  it("hides the converted line until the conversion resolves", () => {
    renderHeader({
      amount: 7.9,
      currency: "MYR",
      displayAmount: "7.9",
      displayCurrency: "MYR",
      isDifferentCurrency: true,
      showOriginalAmount: false,
      disabled: true,
    });

    // The primary line falls back to the original amount, with no "≈" line.
    expect(screen.getByText(/RM\s*7\.90/)).toBeInTheDocument();
    expect(screen.queryByText((text) => text.startsWith("≈"))).not.toBeInTheDocument();
  });
});
