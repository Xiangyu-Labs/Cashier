/**
 * Source Document Grouping Utilities
 *
 * Shared functions for grouping source documents by status.
 * Used by both server actions and client hooks.
 */

import type { SourceDocumentStatusType } from "@/persistence/schema/source-document";

export interface SourceDocumentGroup<T> {
  sourceDocument: T;
  ledgerEntries: T extends { ledgerEntries?: infer E } ? E : never;
}

export interface GroupedSourceDocuments<T> {
  /** Documents waiting in queue */
  queued: SourceDocumentGroup<T>[];
  /** Documents currently being processed */
  processing: SourceDocumentGroup<T>[];
  /** Documents that failed with business anomalies */
  anomaly: SourceDocumentGroup<T>[];
  /** Documents that failed with system errors */
  failed: SourceDocumentGroup<T>[];
  /** Documents with all entries confirmed */
  completed: SourceDocumentGroup<T>[];
}

export interface PendingGroups<T> {
  /** Documents waiting in queue */
  queued: SourceDocumentGroup<T>[];
  /** Documents currently being processed */
  processing: SourceDocumentGroup<T>[];
  /** Documents that failed with business anomalies */
  anomaly: SourceDocumentGroup<T>[];
  /** Documents that failed with system errors */
  failed: SourceDocumentGroup<T>[];
}

/**
 * Group source documents by status
 *
 * @param docs - Array of documents to group
 * @param options - Grouping options
 * @returns Grouped documents
 */
export function groupSourceDocumentsByStatus<
  T extends { status: SourceDocumentStatusType; ledgerEntries?: unknown },
>(docs: T[], options: { includeCompleted?: boolean } = {}): GroupedSourceDocuments<T> {
  const { includeCompleted = true } = options;

  const groups: GroupedSourceDocuments<T> = {
    queued: [],
    processing: [],
    anomaly: [],
    failed: [],
    completed: [],
  };

  for (const doc of docs) {
    const group: SourceDocumentGroup<T> = {
      sourceDocument: doc,
      ledgerEntries: doc.ledgerEntries as T extends { ledgerEntries?: infer E } ? E : never,
    };

    switch (doc.status as SourceDocumentStatusType) {
      case "queued":
        groups.queued.push(group);
        break;
      case "processing":
        groups.processing.push(group);
        break;
      case "anomaly":
        groups.anomaly.push(group);
        break;
      case "failed":
        groups.failed.push(group);
        break;
      case "completed":
        if (includeCompleted) {
          groups.completed.push(group);
        }
        break;
    }
  }

  return groups;
}

/**
 * Group pending source documents (excludes completed)
 *
 * @param docs - Array of documents to group
 * @returns Grouped pending documents
 */
export function groupPendingSourceDocuments<
  T extends { status: SourceDocumentStatusType; ledgerEntries?: unknown },
>(docs: T[]): PendingGroups<T> {
  const groups = groupSourceDocumentsByStatus(docs, { includeCompleted: false });

  return {
    queued: groups.queued,
    processing: groups.processing,
    anomaly: groups.anomaly,
    failed: groups.failed,
  };
}

/**
 * Calculate statistics from grouped documents
 */
export function calculateSourceDocumentStats<T>(
  groups: Pick<GroupedSourceDocuments<T>, "queued" | "processing" | "anomaly" | "failed">
) {
  return {
    queuedCount: groups.queued.length,
    processingCount: groups.processing.length,
    anomalyCount: groups.anomaly.length,
    failedCount: groups.failed.length,
  };
}

/**
 * Calculate total pending count
 */
export function calculatePendingTotal<T>(groups: PendingGroups<T>): number {
  return (
    groups.queued.length + groups.processing.length + groups.anomaly.length + groups.failed.length
  );
}
