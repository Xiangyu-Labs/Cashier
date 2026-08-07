import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const readSnapshot = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const { toastError, toastDismiss } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, dismiss: toastDismiss },
}));

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
import {
  PullToRefreshProvider,
  useExternalLoadingActivity,
} from "@/modules/workspace/pull-to-refresh-context";

function ActivityState() {
  const active = useExternalLoadingActivity();
  return <span data-testid="external-loading">{String(active)}</span>;
}

function renderPreview(queryState: "loading" | "success" | "error", activeTab = "stream") {
  return render(
    <PullToRefreshProvider>
      <ActivityState />
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab={activeTab as "stream" | "details" | "stats" | "settings"}
        queryState={queryState}
        onRetry={retry}
      />
    </PullToRefreshProvider>
  );
}

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
  });

  it("registers external loading and shows the read-only stream preview without a banner", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading");
    expect(await screen.findByText("stream-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("startup-preview-latest-banner")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("external-loading")).toHaveTextContent("true"));
  });

  it("renders the skeleton on a cache miss", async () => {
    readSnapshot.mockResolvedValue(null);
    renderPreview("loading");
    expect(await screen.findByTestId("entries-tab-skeleton")).toBeInTheDocument();
  });

  it("renders the settings skeleton without reading the cache", async () => {
    renderPreview("loading", "settings");
    expect(await screen.findByTestId("settings-tab-skeleton")).toBeInTheDocument();
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("lazily loads the details preview for the details tab", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading", "details");
    expect(await screen.findByText("details-preview")).toBeInTheDocument();
  });

  it("shows an actionable error state when the real query fails", async () => {
    readSnapshot.mockResolvedValue(null);
    renderPreview("error");

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0] ?? [];
    expect(message).toBe("最新数据加载失败。");
    expect(options).toMatchObject({ id: "ledger-startup:user:ledger", duration: Infinity });
    options.action.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("external-loading")).toHaveTextContent("false");
  });
});
