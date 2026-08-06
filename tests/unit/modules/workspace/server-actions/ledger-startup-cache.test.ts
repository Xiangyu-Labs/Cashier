import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/lib/errors";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  query: {
    ledgerSyncState: {
      findFirst: vi.fn(),
    },
  },
}));
const listDocuments = vi.hoisted(() => vi.fn());
const serverComposition = vi.hoisted(() => ({
  sourceDocumentReads: {},
  ledgerReads: {},
  ledgerChanges: {
    getSnapshotMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/persistence", () => ({
  ledgerSyncState: { ledgerId: "ledgerId" },
  sourceDocuments: { updatedAt: "updatedAt", ledgerId: "ledgerId", deletedAt: "deletedAt" },
}));
vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess: (handler: (ledgerId: string, ...args: unknown[]) => unknown) => handler,
}));
vi.mock("@/modules/source-document/application/queries/list-source-document-page", () => ({
  listSourceDocuments: listDocuments,
}));
vi.mock("@/application/server-composition-root", () => ({ serverComposition }));

import {
  getLedgerStartupCacheSnapshot,
  getLedgerStartupCacheVersion,
} from "@/modules/workspace/server-actions/ledger-startup-cache";

function mockVersionQuery(version: bigint, count = "0") {
  serverComposition.ledgerChanges.getSnapshotMetadata.mockResolvedValue({
    version,
    recordCount: Number(count),
  });
}

describe("ledger startup cache server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the snapshot version from sync state and document count", async () => {
    mockVersionQuery(BigInt(7), "12");
    await expect(getLedgerStartupCacheVersion("ledger")).resolves.toEqual({
      version: "7",
      recordCount: 12,
      complete: true,
      truncated: false,
      coverageLimit: 300,
    });
  });

  it("marks large ledgers as truncated", async () => {
    mockVersionQuery(BigInt(1), "2000");
    const result = await getLedgerStartupCacheVersion("ledger");
    expect(result.truncated).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.coverageLimit).toBe(300);
  });

  it("collects a bounded snapshot payload", async () => {
    mockVersionQuery(BigInt(4));
    listDocuments
      .mockResolvedValueOnce({
        items: [{ id: "a" }],
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        items: [{ id: "b" }],
        nextCursor: null,
      });
    const payload = await getLedgerStartupCacheSnapshot("ledger", "4");
    expect(payload.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(payload.version).toBe("4");
    expect(payload.generatedAt).toEqual(expect.any(String));
  });

  it("rejects a snapshot that changed while it was generated", async () => {
    mockVersionQuery(BigInt(5));
    listDocuments.mockResolvedValue({ items: [], nextCursor: null });
    await expect(getLedgerStartupCacheSnapshot("ledger", "4")).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});
