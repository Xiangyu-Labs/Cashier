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
  it("shows the total amount on its own, without a label or breakdown", () => {
    const { container } = renderTotal();

    expect(container.textContent).toBe("合计金额¥92.00");
    expect(screen.getByText("合计金额")).toHaveClass("sr-only");
    expect(container.textContent).not.toContain("=");
  });

  it("marks an approximate total and notes a pending recalculation", () => {
    const { container } = renderTotal(1);

    expect(container.textContent).toContain("≈");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
