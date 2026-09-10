import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { EntryFilterPanel } from "@/modules/ledger/ui/EntryFilterPanel";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: () => <button type="button">date</button>,
}));

let mobileViewport = false;

beforeEach(() => {
  mobileViewport = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: mobileViewport,
      media: "(max-width: 639px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("EntryFilterPanel", () => {
  it("counts only non-default periods as active filters", () => {
    const view = render(
      <EntryFilterPanel
        filters={{}}
        periodParams={{ period: "thisMonth" }}
        onFiltersChange={vi.fn()}
        showCategory={false}
        showCurrency={false}
      />
    );
    expect(screen.getByRole("button", { name: "筛选" })).toBeInTheDocument();

    view.rerender(
      <EntryFilterPanel
        filters={{}}
        periodParams={{ period: "all" }}
        onFiltersChange={vi.fn()}
        showCategory={false}
        showCurrency={false}
      />
    );
    expect(screen.getByRole("button", { name: "已启用 1 个筛选" })).toBeInTheDocument();
  });

  it("opens a bottom dialog and applies the shared draft on mobile", async () => {
    mobileViewport = true;
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={onFiltersChange}
        showCategory={false}
        showCurrency={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "筛选" }));
    screen.getByRole("dialog", { name: "筛选" });
    expect(screen.queryByTestId("popover-content")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜索标题、名称或描述"), "coffee");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ search: "coffee" }));
    expect(screen.queryByRole("dialog", { name: "筛选" })).not.toBeInTheDocument();
  });

  it("renders status checkboxes for all processing statuses", () => {
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

    // Check that all processing status checkbox labels are rendered
    // "处理中" appears as a checkbox label, and "进行中" as a preset button
    expect(screen.getByText("处理中")).toBeDefined(); // checkbox label
    expect(screen.getByText("已完成")).toBeDefined();
    expect(screen.getByText("失败")).toBeDefined();
    expect(screen.getByText("已取消")).toBeDefined();
  });

  it("keeps needs_attention preset in the draft until Apply", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={onFiltersChange}
        showCategory={false}
        showCurrency={false}
      />
    );

    // "待处理" is the needs_attention preset button
    // It's unique — no checkbox shares this text
    const needsAttentionBtn = screen.getByRole("button", { name: "待处理" });
    await user.click(needsAttentionBtn);
    expect(onFiltersChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange.mock.calls[0]?.[0].statuses).toEqual(["failed", "cancelled"]);
  });

  it("keeps in_progress preset in the draft until Apply", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={onFiltersChange}
        showCategory={false}
        showCurrency={false}
      />
    );

    // "进行中" is uniquely the in_progress preset button (distinct from "处理中" checkbox label)
    const presetButton = screen.getByRole("button", { name: "进行中" });
    await user.click(presetButton);
    expect(onFiltersChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange.mock.calls[0]?.[0].statuses).toEqual(["processing"]);
  });

  it("submits filters only once after selecting a date preset", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    render(
      <EntryFilterPanel
        filters={{ categoryId: "cat-1" }}
        onFiltersChange={onFiltersChange}
        periodParams={{ period: "thisMonth" }}
        showCategory={false}
        showCurrency={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "本月" }));
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1" }),
      "thisMonth"
    );
  });

  it("offers a last-month date preset alongside the existing presets", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();

    render(
      <EntryFilterPanel
        filters={{}}
        onFiltersChange={onFiltersChange}
        periodParams={{ period: "thisMonth" }}
        showCategory={false}
        showCurrency={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "上个月" }));
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith(expect.anything(), "lastMonth");
  });
});
