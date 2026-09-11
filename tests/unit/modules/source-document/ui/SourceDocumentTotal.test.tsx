import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceDocumentTotal } from "@/modules/source-document/ui/SourceDocumentViewDetails/components/SourceDocumentTotal";

function renderTotal(staleConversionCount = 0, unconvertedCount = 0) {
  return render(
    <SourceDocumentTotal
      totalInMainCurrency="92.00"
      mainCurrency="CNY"
      staleConversionCount={staleConversionCount}
      unconvertedCount={unconvertedCount}
    />
  );
}

describe("SourceDocumentTotal", () => {
  it("labels the total so the amount never floats unexplained", () => {
    const { container } = renderTotal();

    expect(container.textContent).toBe("合计 ¥92.00");
    // One labelled amount, matching the ledger stream toolbar's total.
    expect(screen.getByText("合计 ¥92.00")).toHaveClass("text-base", "font-semibold");
    expect(container.textContent).not.toContain("=");
  });

  it("marks an approximate total and notes a pending recalculation", () => {
    const { container } = renderTotal(1);

    expect(container.textContent).toContain("≈");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
