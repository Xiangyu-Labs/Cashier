import type { useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  PartialBatchCommandResult,
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
    ((input: { expectedVersion: number; changes: PendingChanges }) => Promise<void>) | undefined;
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
  onBatchDeleteEntries: (ids: string[]) => Promise<PartialBatchCommandResult>;
  onAddEntry?: ((data: AddEntryData) => Promise<void>) | undefined;
  onDeleteEntry?: ((entryId: string) => Promise<void>) | undefined;
  onDelete?: (() => void | Promise<void>) | undefined;
  onAcceptCandidate?: (() => Promise<void>) | undefined;
  onAbandonCandidate?: (() => Promise<void>) | undefined;
  onCancelProcessing?: (() => Promise<void>) | undefined;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}
