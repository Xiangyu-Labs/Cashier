import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const readSnapshot = vi.hoisted(() => vi.fn());

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
    schemaVersion: 5,
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
  });

  it("shows the latest-data banner and the stream preview on a cache hit", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    render(<LedgerStartupPreview snapshotKey="user:ledger" activeTab="stream" />);
    expect(await screen.findByText("正在加载最新数据")).toBeInTheDocument();
    expect(await screen.findByText("stream-preview")).toBeInTheDocument();
  });

  it("renders the skeleton on a cache miss", async () => {
    readSnapshot.mockResolvedValue(null);
    render(<LedgerStartupPreview snapshotKey="user:ledger" activeTab="stream" />);
    expect(await screen.findByTestId("entries-tab-skeleton")).toBeInTheDocument();
  });

  it("renders the settings skeleton without reading the cache", async () => {
    render(<LedgerStartupPreview snapshotKey="user:ledger" activeTab="settings" />);
    expect(await screen.findByTestId("settings-tab-skeleton")).toBeInTheDocument();
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("lazily loads the details preview for the details tab", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    render(<LedgerStartupPreview snapshotKey="user:ledger" activeTab="details" />);
    expect(await screen.findByText("details-preview")).toBeInTheDocument();
  });
});
