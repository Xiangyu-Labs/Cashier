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
 * operation record is removed and later operations are replayed over the
 * canonical data. On rollback, the failed operation is inverted and removed;
 * surviving later ops are replayed.
 */
export class CacheTransactionManager {
  private operations: CacheOperation[] = [];

  /**
   * Start a new operation. Returns the operation object with a unique ID.
   */
  startOperation(
    ledgerId: string,
    baseVersion: string | null = null
  ): CacheOperation {
    const operation: CacheOperation = {
      operationId: crypto.randomUUID(),
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
   * operations over the new canonical base.
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

    // Apply canonical entity to stream cache
    if (canonicalEntity != null) {
      applyOptimisticUpsert(queryClient, op.ledgerId, canonicalEntity);
    }

    // Remove the operation
    this.operations.splice(idx, 1);

    // Replay later operations over the new base
    this.replayAll(queryClient);
  }

  /**
   * Roll back a failed operation: invert its patches, remove it, and replay
   * later operations over the restored base.
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

    // Replay later operations over the restored base
    this.replayAll(queryClient);
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
   * Replay all pending operations. Called after commit/rollback to reapply
   * surviving operations over the (potentially changed) canonical base.
   */
  private replayAll(queryClient: QueryClient): void {
    for (const op of this.operations) {
      for (const patch of op.patches) {
        this.applyPatch(patch, queryClient, op.ledgerId);
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

// Re-export cache operation type for convenience
export type { SourceDocumentListItemDto };
