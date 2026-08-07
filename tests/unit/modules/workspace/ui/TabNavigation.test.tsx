import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import {
  PullToRefreshProvider,
  useRegisterExternalLoadingActivity,
} from "@/modules/workspace/pull-to-refresh-context";

function ExternalLoading() {
  useRegisterExternalLoadingActivity();
  return null;
}

function renderNavigation(element: React.ReactNode, loading = false) {
  return render(
    <PullToRefreshProvider>
      {loading && <ExternalLoading />}
      {element}
    </PullToRefreshProvider>
  );
}

describe("TabNavigation", () => {
  it("renders the four destinations with the new-record action in the middle", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const onOpenInput = vi.fn();

    renderNavigation(
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

    renderNavigation(
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

  it("preloads new-record code on pointer and keyboard intent without opening", async () => {
    const user = userEvent.setup();
    const onInputIntent = vi.fn();
    const onOpenInput = vi.fn();

    renderNavigation(
      <TabNavigation
        activeTab="stream"
        onTabChange={vi.fn()}
        onOpenInput={onOpenInput}
        onInputIntent={onInputIntent}
      />
    );

    const addButton = screen.getByRole("button", { name: /记一笔|new record/i });
    await user.hover(addButton);
    expect(onInputIntent).toHaveBeenCalled();
    expect(onOpenInput).not.toHaveBeenCalled();

    addButton.focus();
    expect(onInputIntent.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("disables only the new-record action during external loading", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    renderNavigation(
      <TabNavigation activeTab="stream" onTabChange={onTabChange} onOpenInput={vi.fn()} />,
      true
    );

    expect(await screen.findByRole("button", { name: /记一笔|new record/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "统计" }));
    expect(onTabChange).toHaveBeenCalledWith("stats");
  });
});
