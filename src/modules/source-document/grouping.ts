import type { SourceDocumentStatusType } from "./types";

export interface SourceDocumentGroup<T> {
  sourceDocument: T;
  ledgerEntries: T extends { ledgerEntries?: infer E } ? Exclude<E, null | undefined> : never[];
}

export interface GroupedSourceDocuments<T> {
  processing: SourceDocumentGroup<T>[];
  candidate_pending: SourceDocumentGroup<T>[];
  duplicate_pending: SourceDocumentGroup<T>[];
  anomaly: SourceDocumentGroup<T>[];
  failed: SourceDocumentGroup<T>[];
  cancelled: SourceDocumentGroup<T>[];
  completed: SourceDocumentGroup<T>[];
}

export interface PendingGroups<T> {
  processing: SourceDocumentGroup<T>[];
  candidate_pending: SourceDocumentGroup<T>[];
  duplicate_pending: SourceDocumentGroup<T>[];
  anomaly: SourceDocumentGroup<T>[];
  failed: SourceDocumentGroup<T>[];
  cancelled: SourceDocumentGroup<T>[];
}

export function groupSourceDocumentsByStatus<
  T extends { status: SourceDocumentStatusType; ledgerEntries?: unknown },
>(docs: T[], options: { includeCompleted?: boolean } = {}): GroupedSourceDocuments<T> {
  const { includeCompleted = true } = options;

  const groups: GroupedSourceDocuments<T> = {
    processing: [],
    candidate_pending: [],
    duplicate_pending: [],
    anomaly: [],
    failed: [],
    cancelled: [],
    completed: [],
  };

  for (const doc of docs) {
    const group: SourceDocumentGroup<T> = {
      sourceDocument: doc,
      ledgerEntries: (doc.ledgerEntries ?? []) as T extends { ledgerEntries?: infer E }
        ? Exclude<E, null | undefined>
        : never[],
    };

    switch (doc.status as SourceDocumentStatusType) {
      case "processing":
        groups.processing.push(group);
        break;
      case "candidate_pending":
        groups.candidate_pending.push(group);
        break;
      case "duplicate_pending":
        groups.duplicate_pending.push(group);
        break;
      case "anomaly":
        groups.anomaly.push(group);
        break;
      case "failed":
        groups.failed.push(group);
        break;
      case "cancelled":
        groups.cancelled.push(group);
        break;
      case "completed":
        if (includeCompleted) {
          groups.completed.push(group);
        }
        break;
      case "deleted":
        break;
    }
  }

  return groups;
}

export function groupPendingSourceDocuments<
  T extends { status: SourceDocumentStatusType; ledgerEntries?: unknown },
>(docs: T[]): PendingGroups<T> {
  const groups = groupSourceDocumentsByStatus(docs, { includeCompleted: false });

  return {
    processing: groups.processing,
    candidate_pending: groups.candidate_pending,
    duplicate_pending: groups.duplicate_pending,
    anomaly: groups.anomaly,
    failed: groups.failed,
    cancelled: groups.cancelled,
  };
}

export function calculateSourceDocumentStats<T>(
  groups: Pick<
    GroupedSourceDocuments<T>,
    "processing" | "candidate_pending" | "duplicate_pending" | "anomaly" | "failed" | "cancelled"
  >
) {
  return {
    processingCount: groups.processing.length,
    duplicatePendingCount: groups.duplicate_pending.length,
    anomalyCount: groups.anomaly.length,
    failedCount: groups.failed.length,
    cancelledCount: groups.cancelled.length,
  };
}

export function calculatePendingTotal<T>(groups: PendingGroups<T>): number {
  return (
    groups.processing.length +
    groups.candidate_pending.length +
    groups.duplicate_pending.length +
    groups.anomaly.length +
    groups.failed.length +
    groups.cancelled.length
  );
}
