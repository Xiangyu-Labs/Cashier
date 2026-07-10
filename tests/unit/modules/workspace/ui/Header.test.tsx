import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";

describe("Header", () => {
  it("renders new record button and no task center control", async () => {
    const onOpenInput = vi.fn();
    const user = userEvent.setup();

    render(<Header onOpenInput={onOpenInput} />);

    expect(
      screen.queryByRole("button", { name: /task center|任务中心/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new record|记一笔|新增记录/i }));
    expect(onOpenInput).toHaveBeenCalledOnce();
  });
});
