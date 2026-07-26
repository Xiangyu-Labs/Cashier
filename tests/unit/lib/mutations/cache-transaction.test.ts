import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  CacheTransactionManager,
  getLedgerTransactionManager,
  removeLedgerTransactionManager,
} from "@/lib/mutations/cache-transaction";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  overrides: Partial<SourceDocumentListItemDto> = {}
): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger-1",
    title: null,
    text: null,
    files: [],
    status: "processing",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: null,
    metadata: {},
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
    ...overrides,
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CacheTransactionManager", () => {
  let manager: CacheTransactionManager;
  let queryClient: QueryClient;

  beforeEach(() => {
    manager = new CacheTransactionManager();
    queryClient = createQueryClient();
  });

  // -----------------------------------------------------------------------
  // Basic flow
  // -----------------------------------------------------------------------

  it("starts a new operation and returns it with a unique ID", () => {
    const op1 = manager.startOperation("ledger-1");
    const op2 = manager.startOperation("ledger-1");

    expect(op1.operationId).toBeDefined();
    expect(op2.operationId).toBeDefined();
    expect(op1.operationId).not.toBe(op2.operationId);
    expect(op1.status).toBe("pending");
    expect(op2.status).toBe("pending");
    expect(op1.order).toBe(0);
    expect(op2.order).toBe(1);
  });

  it("reports pending operations correctly", () => {
    expect(manager.hasPendingOperations()).toBe(false);
    expect(manager.getActiveOperations()).toHaveLength(0);

    manager.startOperation("ledger-1");
    expect(manager.hasPendingOperations()).toBe(true);
    expect(manager.getActiveOperations()).toHaveLength(1);
  });

  it("clears all operations", () => {
    manager.startOperation("ledger-1");
    manager.startOperation("ledger-1");
    expect(manager.getActiveOperations()).toHaveLength(2);

    manager.clear();
    expect(manager.hasPendingOperations()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Commit operations
  // -----------------------------------------------------------------------

  it("commits an operation with canonical entity", () => {
    const item = makeItem("doc-1", { status: "completed" });
    queryClient.setQueryData(["sourceDocuments", "ledger-1", "stream", null, null, null, null, null], {
      pages: [{ items: [], nextCursor: null, generation: 1 }],
      pageParams: [null],
    });

    const op = manager.startOperation("ledger-1");
    op.patches.push({
      type: "upsert",
      entityId: "doc-1",
      entity: makeItem("doc-1", { status: "processing" }),
      prevEntity: null,
    });

    manager.commitOperation(op.operationId, item, queryClient);

    // Operation should be removed
    expect(manager.getActiveOperations()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // C2: Order-based replay — later ops are not replayed over canonical data
  // -----------------------------------------------------------------------

  it("replays only operations created after the committed one (C2)", () => {
    queryClient.setQueryData(["sourceDocuments", "ledger-1", "stream", null, null, null, null, null], {
      pages: [{ items: [makeItem("doc-1")], nextCursor: null, generation: 1 }],
      pageParams: [null],
    });

    // Operation A (order 0): set doc-1 to "processing"
    const opA = manager.startOperation("ledger-1");
    opA.patches.push({
      type: "upsert",
      entityId: "doc-1",
      entity: makeItem("doc-1", { status: "processing" }),
      prevEntity: null,
    });

    // Operation B (order 1): set doc-1 to "processing"
    const opB = manager.startOperation("ledger-1");
    opB.patches.push({
      type: "upsert",
      entityId: "doc-1",
      entity: makeItem("doc-1", { status: "processing" }),
      prevEntity: null,
    });

    // Baseline: 2 pending ops
    expect(manager.getActiveOperations()).toHaveLength(2);

    // B commits first with canonical "completed" status
    manager.commitOperation(opB.operationId, makeItem("doc-1", { status: "completed" }), queryClient);

    // B should be removed from pending, A remains (order 0 < B's order 1)
    const remaining = manager.getActiveOperations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.operationId).toBe(opA.operationId);
  });

  // -----------------------------------------------------------------------
  // C3: Rollback restores prevEntity
  // -----------------------------------------------------------------------

  it("rolls back an upsert by restoring the previous entity (C3)", () => {
    const original = makeItem("doc-1", { status: "completed", title: "Original" });
    queryClient.setQueryData(["sourceDocuments", "ledger-1", "stream", null, null, null, null, null], {
      pages: [{ items: [original], nextCursor: null, generation: 1 }],
      pageParams: [null],
    });

    const op = manager.startOperation("ledger-1");
    op.patches.push({
      type: "upsert",
      entityId: "doc-1",
      entity: makeItem("doc-1", { status: "processing", title: "Optimistic" }),
      prevEntity: original,
    });

    // Roll back
    manager.rollbackOperation(op.operationId, queryClient);

    expect(manager.getActiveOperations()).toHaveLength(0);
  });

  it("rolls back a delete by re-inserting the entity (C3)", () => {
    const original = makeItem("doc-1", { title: "Will be restored" });
    queryClient.setQueryData(["sourceDocuments", "ledger-1", "stream", null, null, null, null, null], {
      pages: [{ items: [original], nextCursor: null, generation: 1 }],
      pageParams: [null],
    });

    const op = manager.startOperation("ledger-1");
    op.patches.push({
      type: "delete",
      entityId: "doc-1",
      entity: original,
      prevEntity: original,
    });

    manager.rollbackOperation(op.operationId, queryClient);

    expect(manager.getActiveOperations()).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// I4: Module-level singleton
// -----------------------------------------------------------------------

describe("getLedgerTransactionManager", () => {
  beforeEach(() => {
    removeLedgerTransactionManager("ledger-1");
  });

  it("returns the same manager for the same ledger ID (I4)", () => {
    const mgr1 = getLedgerTransactionManager("ledger-1");
    const mgr2 = getLedgerTransactionManager("ledger-1");
    expect(mgr1).toBe(mgr2);
  });

  it("returns different managers for different ledger IDs", () => {
    const mgr1 = getLedgerTransactionManager("ledger-1");
    const mgr2 = getLedgerTransactionManager("ledger-2");
    expect(mgr1).not.toBe(mgr2);
  });

  it("creates a new manager after removal", () => {
    const mgr1 = getLedgerTransactionManager("ledger-1");
    removeLedgerTransactionManager("ledger-1");
    const mgr2 = getLedgerTransactionManager("ledger-1");
    expect(mgr1).not.toBe(mgr2);
  });
});
