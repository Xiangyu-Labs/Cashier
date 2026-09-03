import type { PendingChanges } from "@/modules/source-document/detail-types";

function sortedRecord(record: object): Record<string, unknown> {
  const values = record as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key]])
  );
}

export function sourceDocumentSavePayloadKey(
  expectedRevisionId: string,
  changes: PendingChanges
): string {
  return JSON.stringify({
    expectedRevisionId,
    sourceDoc: sortedRecord(changes.sourceDoc),
    entries: Object.fromEntries(
      Object.keys(changes.entries)
        .sort()
        .map((entryId) => [entryId, sortedRecord(changes.entries[entryId] ?? {})])
    ),
  });
}
