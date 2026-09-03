import type { EntryEditData } from "@/modules/source-document/types";

export interface SourceDocPendingChanges {
  title?: string;
  entryDate?: string;
}

export type EntriesPendingChanges = Record<string, Partial<EntryEditData>>;

export interface PendingChanges {
  sourceDoc: SourceDocPendingChanges;
  entries: EntriesPendingChanges;
}
