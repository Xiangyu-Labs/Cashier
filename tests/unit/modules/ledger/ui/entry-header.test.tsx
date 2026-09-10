import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryHeader } from "@/modules/ledger/ui/LedgerEntryViewDetails/components/EntryHeader";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh-CN",
}));

function renderHeader() {
  return render(
    <EntryHeader
      itemName="Lunch"
      amount={12}
      currency="CNY"
      preferredCurrencies={["CNY"]}
      mainCurrency="CNY"
      convertedAmount={null}
      isDifferentCurrency={false}
      onFieldChange={vi.fn()}
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
});
