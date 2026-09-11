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

    expect(container.textContent).toBe("合计¥92.00");
    expect(screen.getByText("合计")).toHaveClass("text-sm", "text-muted-foreground");
    // The amount is the headline figure of the summary row.
    expect(screen.getByText("¥92.00")).toHaveClass("text-lg", "font-semibold");
    expect(container.textContent).not.toContain("=");
  });

  it("marks an approximate total and notes a pending recalculation", () => {
    const { container } = renderTotal(1);

    expect(container.textContent).toContain("≈");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
