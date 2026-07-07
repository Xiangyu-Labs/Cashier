import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/modules/workspace/ui/Header";
import type { Ledger } from "@/modules/ledger/contracts";

function createLedger(overrides: Partial<Ledger> = {}): Ledger {
  return {
    id: "ledger-1",
    userId: "user-1",
    metadata: {
      settings: {
        mainCurrency: "MYR",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("Header", () => {
  it("keeps actions accessible without showing brand or currency text", () => {
    render(
      <Header
        ledger={createLedger()}
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

    expect(screen.queryByText("Cashier")).toBeNull();
    expect(screen.queryByText("MYR")).toBeNull();
    expect(screen.getByRole("button", { name: "任务队列" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "记一笔" })).toBeTruthy();
  });
});
