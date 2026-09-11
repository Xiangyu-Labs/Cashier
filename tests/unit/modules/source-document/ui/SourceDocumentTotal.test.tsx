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
  it("shows the total as a bare amount", () => {
    const { container } = renderTotal();

    expect(container.textContent).toBe("¥92.00");
    // A bare amount, matching the ledger stream toolbar's total.
    expect(screen.getByText("¥92.00")).toHaveClass("text-base", "font-semibold");
    expect(container.textContent).not.toContain("=");
  });

  it("marks an approximate total and notes a pending recalculation", () => {
    const { container } = renderTotal(1);

    expect(container.textContent).toContain("≈");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
