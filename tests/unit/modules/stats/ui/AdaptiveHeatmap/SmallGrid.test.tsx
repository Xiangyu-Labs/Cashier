import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmallGridHeatmap } from "@/modules/stats/ui/AdaptiveHeatmap";

const heatmapStats = {
  minAmount: "10",
  maxAmount: "50",
  avgAmount: "30",
  p80Amount: "40",
};

describe("SmallGridHeatmap", () => {
  it("renders out-of-range padding days as non-interactive placeholders", () => {
    const onDayClick = vi.fn();
    const { container } = render(
      <SmallGridHeatmap
        days={[
          { date: "2026-08-05", totalAmount: "20", entryCount: 1, currencies: ["CNY"] },
          { date: "2026-08-06", totalAmount: "0", entryCount: 0, currencies: [] },
        ]}
        stats={heatmapStats}
        currency="CNY"
        locale="zh-CN"
        onDayClick={onDayClick}
        queryRange={{ startDate: "2026-08-05", endDate: "2026-08-07" }}
      />
    );

    // 2026-08-05 is a Wednesday; Monday/Tuesday before it and Saturday/Sunday
    // after it are padding cells that must not be interactive.
    for (const paddingDate of ["2026-08-03", "2026-08-04", "2026-08-08", "2026-08-09"]) {
      const cell = container.querySelector(`[data-heatmap-date="${paddingDate}"]`);
      expect(cell).not.toBeNull();
      expect(cell?.querySelector("button")).toBeNull();
      expect(cell?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }

    // In-range days stay clickable, including days without spending.
    fireEvent.click(screen.getByRole("button", { name: /2026-08-05/ }));
    fireEvent.click(screen.getByRole("button", { name: /2026-08-06/ }));
    expect(onDayClick).toHaveBeenCalledTimes(2);
    expect(onDayClick).toHaveBeenCalledWith("2026-08-05");
    expect(onDayClick).toHaveBeenCalledWith("2026-08-06");
  });
});
