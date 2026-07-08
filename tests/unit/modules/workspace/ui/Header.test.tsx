import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";

describe("Header", () => {
  it("shows product identity and global actions without ledger selection", () => {
    render(
      <Header
        pendingStats={{
          total: 0,
          pendingCount: 0,
          runningCount: 0,
          failedCount: 0,
          anomalyCount: 0,
        }}
        onOpenTaskQueue={vi.fn()}
        onOpenInput={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "任务中心" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记一笔" })).toBeInTheDocument();
  });
});
