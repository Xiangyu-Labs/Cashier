import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const readSnapshot = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());

vi.mock("@/modules/workspace/ledger-startup-cache-store", () => ({
  readLedgerStartupSnapshot: readSnapshot,
}));

vi.mock("@/modules/workspace/ui/LedgerStartupStreamPreview", () => ({
  LedgerStartupStreamPreview: () => <div>stream-preview</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerStartupDetailsPreview", () => ({
  LedgerStartupDetailsPreview: () => <div>details-preview</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerStartupStatsPreview", () => ({
  LedgerStartupStatsPreview: () => <div>stats-preview</div>,
}));

import { LedgerStartupPreview } from "@/modules/workspace/ui/LedgerStartupPreview";

function snapshot(): LedgerStartupCacheSnapshot {
  return {
    key: "user:ledger",
    schemaVersion: 1,
    userId: "user",
    ledgerId: "ledger",
    items: [
      {
        id: "doc-1",
        ledgerId: "ledger",
        title: "Doc",
        text: null,
        files: [],
        status: "completed",
        type: "manual",
        anomalyReason: null,
        entryDate: "2026-08-01",
        metadata: {},
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        deletedAt: null,
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: [],
      },
    ],
    syncVersion: "1",
    recordCount: 1,
    complete: true,
    truncated: false,
    coverageLimit: 1000,
    lastSyncedAt: "2026-08-01T00:00:00.000Z",
    fullSyncAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("LedgerStartupPreview", () => {
  beforeEach(() => {
    readSnapshot.mockReset();
    retry.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("shows the latest-data banner and the stream preview on a cache hit", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="stream"
        queryState="loading"
        onRetry={retry}
      />
    );
    expect(await screen.findByText("正在加载最新数据")).toBeInTheDocument();
    expect(await screen.findByText("stream-preview")).toBeInTheDocument();

    const indicator = screen.getByTestId("startup-preview-latest-banner").querySelector("span");
    expect(indicator).toHaveClass("animate-spin");
  });

  it("shows a solid dot instead of a spinning ring under reduced motion", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    readSnapshot.mockResolvedValue(snapshot());
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="stream"
        queryState="loading"
        onRetry={retry}
      />
    );
    expect(await screen.findByText("正在加载最新数据")).toBeInTheDocument();

    const indicator = screen.getByTestId("startup-preview-latest-banner").querySelector("span");
    expect(indicator).not.toHaveClass("animate-spin");
    expect(indicator).not.toHaveClass("border-t-info");
    expect(indicator).toHaveClass("bg-info");
  });

  it("renders the skeleton on a cache miss", async () => {
    readSnapshot.mockResolvedValue(null);
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="stream"
        queryState="loading"
        onRetry={retry}
      />
    );
    expect(await screen.findByTestId("entries-tab-skeleton")).toBeInTheDocument();
  });

  it("renders the settings skeleton without reading the cache", async () => {
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="settings"
        queryState="loading"
        onRetry={retry}
      />
    );
    expect(await screen.findByTestId("settings-tab-skeleton")).toBeInTheDocument();
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("lazily loads the details preview for the details tab", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="details"
        queryState="loading"
        onRetry={retry}
      />
    );
    expect(await screen.findByText("details-preview")).toBeInTheDocument();
  });

  it("shows an actionable error state when the real query fails", async () => {
    readSnapshot.mockResolvedValue(null);
    render(
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab="stream"
        queryState="error"
        onRetry={retry}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("最新数据加载失败。");
    screen.getByRole("button", { name: "重试" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
