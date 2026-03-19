import type { SourceDocumentStatusType } from "./types";

export interface SourceDocumentGroup<T> {
  sourceDocument: T;
  ledgerEntries: T extends { ledgerEntries?: infer E } ? E : never;
}

export interface GroupedSourceDocuments<T> {
  queued: SourceDocumentGroup<T>[];
  processing: SourceDocumentGroup<T>[];
  anomaly: SourceDocumentGroup<T>[];
  failed: SourceDocumentGroup<T>[];
  completed: SourceDocumentGroup<T>[];
}

export interface PendingGroups<T> {
  queued: SourceDocumentGroup<T>[];
  processing: SourceDocumentGroup<T>[];
  anomaly: SourceDocumentGroup<T>[];
  failed: SourceDocumentGroup<T>[];
}

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

export function calculatePendingTotal<T>(groups: PendingGroups<T>): number {
  return (
    groups.queued.length + groups.processing.length + groups.anomaly.length + groups.failed.length
  );
}
