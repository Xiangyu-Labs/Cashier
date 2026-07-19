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
    // "处理中" appears as a checkbox label, and "进行中" as a preset button
    expect(screen.getByText("排队中")).toBeDefined();
    expect(screen.getByText("处理中")).toBeDefined(); // checkbox label
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
    // "进行中" is the in_progress preset button (distinct from "处理中" checkbox label)
    expect(screen.getByRole("button", { name: "进行中" })).toBeDefined();
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

    // "进行中" is uniquely the in_progress preset button (distinct from "处理中" checkbox label)
    const presetButton = screen.getByRole("button", { name: "进行中" });
    await user.click(presetButton);
    expect(onApplyPreset).toHaveBeenCalledWith("in_progress");
  });
});
