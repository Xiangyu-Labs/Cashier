import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const cardProps = vi.hoisted(() => vi.fn());

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentCard: (props: { sourceDocument: { id: string; title: string | null } }) => {
    cardProps(props);
    return <div data-testid={`card-${props.sourceDocument.id}`}>{props.sourceDocument.title}</div>;
  },
}));

vi.mock("@/modules/source-document/ui/SourceDocumentDetailModal", () => ({
  SourceDocumentDetailModal: () => null,
}));

vi.mock("@/modules/source-document/hooks", () => ({
  useCachedImageUrls: () => new Map<string, string>(),
}));

import { LedgerStartupStreamPreview } from "@/modules/workspace/ui/LedgerStartupStreamPreview";

function entry(docId: string, itemName: string): SourceDocumentLedgerEntryDto {
  return {
    id: `${docId}-entry`,
    ledgerId: "ledger",
    categoryId: null,
    sourceDocumentId: docId,
    amount: "1",
    currency: "CNY",
    itemName,
    description: null,
    convertedAmount: null,
    exchangeRate: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function document(id: string, itemName: string): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger",
    type: "manual",
    status: "completed",
    title: id,
    text: null,
    anomalyReason: null,
    entryDate: "2026-08-01",
    metadata: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    files: [{ id: `file-${id}`, contentType: "image/png", byteSize: 100, originalFilename: null }],
    hasImages: true,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [entry(id, itemName)],
  };
}

function snapshot(items: SourceDocumentListItemDto[]): LedgerStartupCacheSnapshot {
  return {
    key: "user:ledger",
    schemaVersion: 1,
    userId: "user",
    ledgerId: "ledger",
    mainCurrency: "CNY",
    preferredCurrencies: ["CNY"],
    categories: [],
    items,
    syncVersion: "1",
    recordCount: items.length,
    complete: true,
    truncated: false,
    coverageLimit: 1000,
    lastSyncedAt: "2026-08-01T00:00:00.000Z",
    fullSyncAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("LedgerStartupStreamPreview filtering", () => {
  it("shows the only matching document when it is beyond the preview limit", () => {
    cardProps.mockClear();
    const items = Array.from({ length: 21 }, (_, index) =>
      document(`doc-${index + 1}`, index === 20 ? "needle" : "noise")
    );
    const filters: EntryFilters = { search: "needle" };

    render(<LedgerStartupStreamPreview snapshot={snapshot(items)} initialFilters={filters} />);

    expect(screen.getByTestId("card-doc-21")).toBeInTheDocument();
    expect(screen.queryByTestId("card-doc-1")).not.toBeInTheDocument();
    expect(cardProps).toHaveBeenCalledTimes(1);
    const toolbar = screen.getByTestId("entries-toolbar");
    expect(within(toolbar).getByText(formatCurrencyAmount(1, "CNY", "zh"))).toBeInTheDocument();
  });

  it("renders only the first 20 matches while the total covers all matches", () => {
    cardProps.mockClear();
    const items = Array.from({ length: 25 }, (_, index) => document(`doc-${index + 1}`, "match"));
    const filters: EntryFilters = { search: "match" };

    render(<LedgerStartupStreamPreview snapshot={snapshot(items)} initialFilters={filters} />);

    expect(screen.getByTestId("card-doc-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-doc-20")).toBeInTheDocument();
    expect(screen.queryByTestId("card-doc-21")).not.toBeInTheDocument();
    expect(cardProps).toHaveBeenCalledTimes(20);
    const toolbar = screen.getByTestId("entries-toolbar");
    expect(within(toolbar).getByText(formatCurrencyAmount(25, "CNY", "zh"))).toBeInTheDocument();
  });
});
