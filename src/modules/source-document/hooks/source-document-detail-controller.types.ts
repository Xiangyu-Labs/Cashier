import type { useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import type { AddEntryData } from "./useSourceDocumentDetailMutations";

export interface UseSourceDocumentDetailControllerOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  ledgerEntries: LedgerEntry[];
  open: boolean;
  isAccepting: boolean;
  isAbandoning: boolean;
  isCancelling: boolean;
  onClose: () => void;
  onReload?: (() => Promise<void>) | undefined;
  onSaveAll?:
    | ((input: {
        expectedRevisionId: string;
        operationId: string;
        changes: PendingChanges;
      }) => Promise<unknown>)
    | undefined;
  onSplit?:
    | ((
        input: Omit<SplitSourceDocumentInput, "sourceDocumentId">
      ) => Promise<SplitSourceDocumentResultDto>)
    | undefined;
  onBatchUpdate: (
    ids: string[],
    data: {
      categoryId?: string | null;
      currency?: string;
      entryDate?: string;
      description?: string;
    }
  ) => Promise<{ affectedCount: number } | undefined>;
  onBatchDeleteEntries: (ids: string[]) => Promise<string[]>;
  onAddEntry?: ((data: AddEntryData) => Promise<unknown>) | undefined;
  onDeleteEntry?: ((entryId: string) => Promise<unknown>) | undefined;
  onDelete?: (() => void | Promise<void>) | undefined;
  onAcceptCandidate?: (() => Promise<void>) | undefined;
  onAbandonCandidate?: (() => Promise<void>) | undefined;
  onCancelProcessing?: (() => Promise<void>) | undefined;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}
