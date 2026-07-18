import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Header", () => {
  it("renders new record button and no task center control", async () => {
    const onOpenInput = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<Header ledgerId="test-ledger-id" onOpenInput={onOpenInput} />);

    expect(
      screen.queryByRole("button", { name: /task center|任务中心/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new record|记一笔|新增记录/i }));
    expect(onOpenInput).toHaveBeenCalledOnce();
  });
});
