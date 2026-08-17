import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import zhMessages from "../../../../../messages/zh.json";
import { FEATURE_MESSAGES, pickMessages } from "@/i18n/client-feature-messages";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const readSnapshot = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());

vi.mock("@/modules/workspace/ledger-startup-cache-store", () => ({
  readLedgerStartupSnapshot: readSnapshot,
}));

vi.mock("@/i18n/DeferredFeatureMessages", () => ({
  DeferredFeatureMessages: ({ children }: { children: ReactNode }) => children,
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

function renderPreview(
  queryState: "loading" | "success" | "error",
  activeTab = "stream",
  locale: "en" | "zh" = "zh"
) {
  const catalog = locale === "en" ? enMessages : zhMessages;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(catalog, FEATURE_MESSAGES.shell)}
    >
      <LedgerStartupPreview
        snapshotKey="user:ledger"
        activeTab={activeTab as "stream" | "details" | "stats" | "settings"}
        queryState={queryState}
        onRetry={retry}
      />
    </NextIntlClientProvider>
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

  it("shows the read-only stream preview with persistent cache status", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading");
    expect(await screen.findByText("stream-preview")).toBeInTheDocument();
    expect(screen.getByTestId("startup-preview-latest-banner")).toBeInTheDocument();
    expect(screen.getByText("正在加载最新数据…")).toBeInTheDocument();
    expect(screen.getByText("只读预览")).toBeInTheDocument();
  });

  it.each([
    ["zh", "缓存于"],
    ["en", "Cached at"],
  ] as const)("loads the cached-at message from the %s shell catalog", async (locale, prefix) => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading", "stream", locale);

    expect(await screen.findByText(new RegExp(`^${prefix}`))).toBeInTheDocument();
    expect(screen.queryByText("LedgerStartupPreview.cachedAt")).toBeNull();
  });

  it("renders the skeleton on a cache miss", async () => {
    readSnapshot.mockResolvedValue(null);
    renderPreview("loading");
    expect(await screen.findByTestId("entries-tab-skeleton")).toBeInTheDocument();
  });

  it("renders the settings skeleton while reading only the ledger cache timestamp", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading", "settings");
    expect(await screen.findByTestId("settings-tab-skeleton")).toBeInTheDocument();
    expect(readSnapshot).toHaveBeenCalledWith("user:ledger");
    expect(screen.getByText("正在加载最新数据…")).toBeInTheDocument();
    expect(screen.getByText(/^缓存于/)).toBeInTheDocument();
  });

  it("lazily loads the details preview for the details tab", async () => {
    readSnapshot.mockResolvedValue(snapshot());
    renderPreview("loading", "details");
    expect(await screen.findByText("details-preview")).toBeInTheDocument();
  });

  it("shows an actionable error state when the real query fails", async () => {
    readSnapshot.mockResolvedValue(null);
    renderPreview("error");

    expect(await screen.findByRole("alert")).toHaveTextContent("最新数据加载失败。");
    screen.getByRole("button", { name: "重试" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
