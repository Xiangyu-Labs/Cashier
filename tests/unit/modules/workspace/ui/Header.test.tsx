import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";

describe("Header", () => {
  it("renders only the supplied navigation and no legacy branding or status controls", () => {
    render(<Header navigation={<nav aria-label="Ledger navigation">navigation</nav>} />);

    expect(screen.getByText("navigation")).toBeInTheDocument();
    expect(screen.queryByText("Cashier")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /处理中|in progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /待处理|needing attention/i })).not.toBeInTheDocument();
  });

  it("does not add controls outside the supplied navigation", async () => {
    const user = userEvent.setup();
    const onOpenInput = vi.fn();

    render(
      <Header
        navigation={<button onClick={onOpenInput}>记一笔</button>}
      />
    );

    await user.click(screen.getByRole("button", { name: "记一笔" }));
    expect(onOpenInput).toHaveBeenCalledOnce();
  });
});
