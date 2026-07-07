import { render, screen } from "@testing-library/react";
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
});
