import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";

describe("TabNavigation", () => {
  it("renders all four top-level tabs with accessible labels", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();

    render(
      <Tabs value="stream">
        <TabNavigation activeTab="stream" onTabChange={onTabChange} />
      </Tabs>
    );

    expect(screen.getByRole("tab", { name: "流水" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "明细" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "统计" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "设置" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "统计" }));

    expect(onTabChange).toHaveBeenCalledWith("stats");
  });

  it("calls onTabIntent on pointer enter for inactive tabs", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const onTabIntent = vi.fn();

    render(
      <Tabs value="stream">
        <TabNavigation activeTab="stream" onTabChange={onTabChange} onTabIntent={onTabIntent} />
      </Tabs>
    );

    const statsTab = screen.getByRole("tab", { name: "统计" });
    await user.hover(statsTab);

    expect(onTabIntent).toHaveBeenCalledWith("stats");

    // Verify click navigation still works alongside intent
    await user.click(statsTab);
    expect(onTabChange).toHaveBeenCalledWith("stats");
  });

  it("calls onTabIntent on focus for inactive tabs", async () => {
    const onTabIntent = vi.fn();

    render(
      <Tabs value="stream">
        <TabNavigation activeTab="stream" onTabChange={vi.fn()} onTabIntent={onTabIntent} />
      </Tabs>
    );

    const detailsTab = screen.getByRole("tab", { name: "明细" });
    detailsTab.focus();

    expect(onTabIntent).toHaveBeenCalledWith("details");
  });
});
