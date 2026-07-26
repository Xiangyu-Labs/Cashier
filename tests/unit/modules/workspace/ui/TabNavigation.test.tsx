import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";

describe("TabNavigation", () => {
  it("renders the four destinations with the new-record action in the middle", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const onOpenInput = vi.fn();

    render(
      <TabNavigation activeTab="stream" onTabChange={onTabChange} onOpenInput={onOpenInput} />
    );

    expect(screen.getByRole("button", { name: "流水" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "明细" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "统计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "流水",
      "明细",
      "",
      "统计",
      "设置",
    ]);

    await user.click(screen.getByRole("button", { name: "统计" }));
    expect(onTabChange).toHaveBeenCalledWith("stats");

    await user.click(screen.getByRole("button", { name: /记一笔|new record/i }));
    expect(onOpenInput).toHaveBeenCalledOnce();
  });

  it("calls onTabIntent on pointer enter and focus for inactive destinations", async () => {
    const user = userEvent.setup();
    const onTabIntent = vi.fn();

    render(
      <TabNavigation
        activeTab="stream"
        onTabChange={vi.fn()}
        onOpenInput={vi.fn()}
        onTabIntent={onTabIntent}
      />
    );

    const statsButton = screen.getByRole("button", { name: "统计" });
    await user.hover(statsButton);
    expect(onTabIntent).toHaveBeenCalledWith("stats");

    const detailsButton = screen.getByRole("button", { name: "明细" });
    detailsButton.focus();
    expect(onTabIntent).toHaveBeenCalledWith("details");
  });
});
