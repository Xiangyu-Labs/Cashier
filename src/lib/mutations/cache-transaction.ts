"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
  applyOptimisticCounts,
} from "@/modules/source-document/hooks/source-document-optimistic-cache";

// ---------------------------------------------------------------------------
// Patch types
// ---------------------------------------------------------------------------

export interface UpsertPatch {
  type: "upsert";
  entityId: string;
  entity: SourceDocumentListItemDto;
  prevEntity: SourceDocumentListItemDto | null;
}

export interface DeletePatch {
  type: "delete";
  entityId: string;
  entity: SourceDocumentListItemDto;
  prevEntity: SourceDocumentListItemDto | null;
}

export interface CountsPatch {
  type: "counts";
  countDelta: { processing: number; attention: number };
}

export type CachePatch = UpsertPatch | DeletePatch | CountsPatch;

// ---------------------------------------------------------------------------
// CacheOperation
// ---------------------------------------------------------------------------

export interface CacheOperation {
  operationId: string;
  /** Monotonically increasing insertion-order counter. Operations created later
   *  have a higher order. Used to determine which pending ops to replay after
   *  a commit/rollback — only ops with order > the committed op's order are
   *  replayed, preserving the canonical base from earlier ops. */
  order: number;
  clientSubmissionId?: string;
  baseVersion: string | null;
  patches: CachePatch[];
  projections: string[];
  ledgerId: string;
  status: "pending" | "committed" | "rolled_back";
}

// ---------------------------------------------------------------------------
// Transaction Manager
// ---------------------------------------------------------------------------

/**
 * Manages a stack of pending optimistic cache operations for source-document
 * mutations. Operations are ordered by creation time. On commit, the
 * operation record is removed and only operations created after it are
 * replayed over the canonical data. On rollback, the failed operation is
 * inverted and removed; surviving later ops are replayed.
 *
 * Canonical base invariant: operations created before a committed op are
 * considered part of the canonical base and are NOT replayed. This prevents
 * stale optimistic patches from overwriting authoritative server data.
 */
export class CacheTransactionManager {
  private operations: CacheOperation[] = [];
  private nextOrder = 0;

  /**
   * Start a new operation. Returns the operation object with a unique ID.
   */
  startOperation(
    ledgerId: string,
    baseVersion: string | null = null
  ): CacheOperation {
    const operation: CacheOperation = {
      operationId: crypto.randomUUID(),
      order: this.nextOrder++,
      baseVersion,
      patches: [],
      projections: [],
      ledgerId,
      status: "pending",
    };
    this.operations.push(operation);
    return operation;
  }

  /**
   * Commit an acknowledged operation: remove it from the pending stack, apply
   * the canonical entity to the cache if provided, and replay any later
   * operations (created after this one) over the new canonical base.
   *
   * Operations created before the committed one are NOT replayed — they are
   * already accounted for in the canonical base.
   */
  commitOperation(
    operationId: string,
    canonicalEntity: SourceDocumentListItemDto | null,
    queryClient: QueryClient
  ): void {
    const idx = this.operations.findIndex(
      (o) => o.operationId === operationId
    );
    if (idx === -1) return;

    const op = this.operations[idx];
    if (op == null) return;

    op.status = "committed";

    // Apply canonical entity to stream cache — authoritative server state
    if (canonicalEntity != null) {
      applyOptimisticUpsert(queryClient, op.ledgerId, canonicalEntity);
    }

    // Remove the operation
    this.operations.splice(idx, 1);

    // Replay only operations created AFTER this one (higher order number).
    // Earlier operations are already reflected in the canonical base and must
    // NOT be replayed over authoritative data.
    this.replayAll(queryClient, op.order);
  }

  /**
   * Replace a placeholder entity with the canonical entity from the server.
   * Used during create reconciliation to swap the clientSubmissionId-tagged
   * placeholder with the real server entity (keyed by sourceDocumentId).
   */
  replacePlaceholder(
    placeholderId: string,
    canonicalEntity: SourceDocumentListItemDto,
    queryClient: QueryClient
  ): void {
    // Apply canonical entity — this will either overwrite the placeholder
    // (if found by id) or add alongside it. Then remove the placeholder.
    applyOptimisticUpsert(queryClient, canonicalEntity.ledgerId, canonicalEntity);
    applyOptimisticDelete(queryClient, canonicalEntity.ledgerId, placeholderId);
  }

  /**
   * Roll back a failed operation: invert its patches, remove it, and replay
   * only operations created after it over the restored base.
   */
  rollbackOperation(
    operationId: string,
    queryClient: QueryClient
  ): void {
    const idx = this.operations.findIndex(
      (o) => o.operationId === operationId
    );
    if (idx === -1) return;

    const op = this.operations[idx];
    if (op == null) return;

    op.status = "rolled_back";

    // Invert patches one at a time
    for (const patch of op.patches) {
      this.invertPatch(patch, queryClient, op.ledgerId);
    }

    // Remove the operation
    this.operations.splice(idx, 1);

    // Replay only operations created AFTER this one
    this.replayAll(queryClient, op.order);
  }

  /**
   * Invert a single patch.
   */
  private invertPatch(
    patch: CachePatch,
    queryClient: QueryClient,
    ledgerId: string
  ): void {
    switch (patch.type) {
      case "upsert": {
        if (patch.prevEntity != null) {
          applyOptimisticUpsert(queryClient, ledgerId, patch.prevEntity);
        } else {
          applyOptimisticDelete(queryClient, ledgerId, patch.entityId);
        }
        break;
      }
      case "delete": {
        applyOptimisticUpsert(queryClient, ledgerId, patch.entity);
        break;
      }
      case "counts": {
        applyOptimisticCounts(queryClient, ledgerId, {
          processing: -patch.countDelta.processing,
          attention: -patch.countDelta.attention,
        });
        break;
      }
    }
  }

  /**
   * Replay pending operations created after the given order threshold.
   * Operations at or before the threshold are NOT replayed — they are
   * considered part of the canonical base.
   */
  private replayAll(queryClient: QueryClient, afterOrder = -1): void {
    for (const op of this.operations) {
      if (op.order > afterOrder) {
        for (const patch of op.patches) {
          this.applyPatch(patch, queryClient, op.ledgerId);
        }
      }
    }
  }

  /**
   * Apply a single patch (forward direction).
   */
  private applyPatch(
    patch: CachePatch,
    queryClient: QueryClient,
    ledgerId: string
  ): void {
    switch (patch.type) {
      case "upsert": {
        applyOptimisticUpsert(queryClient, ledgerId, patch.entity);
        break;
      }
      case "delete": {
        applyOptimisticDelete(queryClient, ledgerId, patch.entityId);
        break;
      }
      case "counts": {
        applyOptimisticCounts(queryClient, ledgerId, patch.countDelta);
        break;
      }
    }
  }

  /**
   * Get all active (pending) operations.
   */
  getActiveOperations(): CacheOperation[] {
    return this.operations.filter((o) => o.status === "pending");
  }

  /**
   * Whether there are any pending operations.
   */
  hasPendingOperations(): boolean {
    return this.getActiveOperations().length > 0;
  }

  /**
   * Clear all operations (for cleanup on unmount).
   */
  clear(): void {
    this.operations = [];
  }
}

// ---------------------------------------------------------------------------
// Module-level transaction manager registry (I4: survive remounts)
// ---------------------------------------------------------------------------

const globalManagers = new Map<string, CacheTransactionManager>();

/**
 * Get or create a CacheTransactionManager scoped to a ledger.
 * Uses a module-level singleton so in-flight operation state is not lost
 * when the calling component remounts.
 */
export function getLedgerTransactionManager(
  ledgerId: string
): CacheTransactionManager {
  let manager = globalManagers.get(ledgerId);
  if (manager == null) {
    manager = new CacheTransactionManager();
    globalManagers.set(ledgerId, manager);
  }
  return manager;
}

/**
 * Remove a ledger-scoped transaction manager (for cleanup).
 */
export function removeLedgerTransactionManager(ledgerId: string): void {
  globalManagers.delete(ledgerId);
}

// Re-export cache operation type for convenience
export type { SourceDocumentListItemDto };
