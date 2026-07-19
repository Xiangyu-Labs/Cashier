import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { EntryFilterPanel } from "@/modules/ledger/ui/EntryFilterPanel";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    align,
    collisionPadding,
    className,
  }: ComponentPropsWithoutRef<"div"> & {
    align?: string;
    collisionPadding?: number;
  }) => (
    <div
      data-testid="popover-content"
      data-align={align}
      data-collision-padding={collisionPadding}
      className={className}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      date
    </button>
  ),
}));

describe("EntryFilterPanel", () => {
  it("centers the mobile filter popover within the viewport", () => {
    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={vi.fn()}
        showCategory={false}
        showCurrency={false}
      />
    );

    const filterPopover = screen
      .getAllByTestId("popover-content")
      .find((content) => content.className.includes("w-[min(420px,calc(100vw-2rem))]"));

    expect(filterPopover).toBeDefined();
    expect(filterPopover?.getAttribute("data-align")).toBe("center");
    expect(filterPopover?.getAttribute("data-collision-padding")).toBe("16");
  });

  it("renders status checkboxes for all six active statuses", () => {
    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={vi.fn()}
        showCategory={false}
        showCurrency={false}
      />
    );

    // Check that the status section header is rendered
    expect(screen.getByText("状态")).toBeDefined();

    // Check that all six status checkbox labels are rendered
    // "处理中" appears both as a checkbox label and a preset button
    expect(screen.getByText("排队中")).toBeDefined();
    expect(screen.getAllByText("处理中").length).toBeGreaterThanOrEqual(2); // checkbox + button
    expect(screen.getByText("已完成")).toBeDefined();
    expect(screen.getByText("异常")).toBeDefined();
    expect(screen.getByText("失败")).toBeDefined();
    expect(screen.getByText("待核准")).toBeDefined();
  });

  it("renders All Statuses reset button and preset buttons", () => {
    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={vi.fn()}
        showCategory={false}
        showCurrency={false}
      />
    );

    expect(screen.getByText("全部状态")).toBeDefined();
    expect(screen.getByText("待处理")).toBeDefined();
    // "处理中" appears as both checkbox and preset button
    expect(screen.getAllByText("处理中").length).toBeGreaterThanOrEqual(2);
  });

  it("calls onApplyPreset with needs_attention when preset button is clicked", async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={vi.fn()}
        onApplyPreset={onApplyPreset}
        showCategory={false}
        showCurrency={false}
      />
    );

    // "待处理" is the needs_attention preset button
    // It's unique — no checkbox shares this text
    const needsAttentionBtn = screen.getByRole("button", { name: "待处理" });
    await user.click(needsAttentionBtn);
    expect(onApplyPreset).toHaveBeenCalledWith("needs_attention");
  });

  it("calls onApplyPreset with in_progress when preset button is clicked", async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={vi.fn()}
        onApplyPreset={onApplyPreset}
        showCategory={false}
        showCurrency={false}
      />
    );

    // "处理中" appears twice: as checkbox label and as preset button
    // Get the button element specifically
    const inProgressButtons = screen.getAllByRole("button", { name: "处理中" });
    // The preset button is the one with variant="outline" class
    const presetButton = inProgressButtons.find((btn) =>
      btn.className.includes("border")
    );
    expect(presetButton).toBeDefined();
    await user.click(presetButton!);
    expect(onApplyPreset).toHaveBeenCalledWith("in_progress");
  });
});
