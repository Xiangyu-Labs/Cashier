import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LedgerQueryErrorBanner } from "@/modules/workspace/ui/LedgerQueryErrorBanner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("LedgerQueryErrorBanner", () => {
  it("delegates retry to the active-tab retry callback", () => {
    const onRetry = vi.fn();
    render(<LedgerQueryErrorBanner onRetry={onRetry} />);

    expect(screen.getByText("description")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the standalone first-load error message", () => {
    render(<LedgerQueryErrorBanner empty onRetry={vi.fn()} />);

    expect(screen.getByText("emptyDescription")).toBeInTheDocument();
    expect(screen.queryByText("description")).not.toBeInTheDocument();
  });
});
