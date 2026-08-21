"use client";

import { toast } from "sonner";
import type { EntryFilters } from "@/modules/ledger/filters";
import type { CreatedRecordResult } from "@/modules/source-document/contracts";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import type { LedgerTab } from "@/lib/ledger-tabs";

export type NewRecordInputMode = "ai" | "quick";

interface NewRecordSuccessMessages {
  aiSuccess: string;
  quickSuccess: string;
  savedMayBeHidden: string;
  viewRecord: string;
}

interface ShowNewRecordSuccessFeedbackOptions {
  mode: NewRecordInputMode;
  ledgerId: string;
  result: CreatedRecordResult;
  activeTab: LedgerTab;
  committedFilters: EntryFilters;
  messages: NewRecordSuccessMessages;
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function shouldWarnNewRecordMayBeHidden(
  activeTab: LedgerTab,
  committedFilters: EntryFilters,
  entryDate: string
): boolean {
  if (activeTab !== "stream") return true;

  if (
    (committedFilters.search != null && committedFilters.search !== "") ||
    (committedFilters.statuses?.length ?? 0) > 0 ||
    (committedFilters.categoryId != null && committedFilters.categoryId !== "") ||
    (committedFilters.currency != null && committedFilters.currency !== "") ||
    committedFilters.minAmount != null ||
    committedFilters.maxAmount != null
  ) {
    return true;
  }

  const submittedDate = dateOnly(entryDate);
  if (committedFilters.startDate != null && submittedDate < dateOnly(committedFilters.startDate)) {
    return true;
  }
  if (committedFilters.endDate != null && submittedDate > dateOnly(committedFilters.endDate)) {
    return true;
  }

  return false;
}

export function showNewRecordSuccessFeedback({
  mode,
  ledgerId,
  result,
  activeTab,
  committedFilters,
  messages,
}: ShowNewRecordSuccessFeedbackOptions): void {
  if (shouldWarnNewRecordMayBeHidden(activeTab, committedFilters, result.entryDate)) {
    toast.success(messages.savedMayBeHidden, {
      action: {
        label: messages.viewRecord,
        onClick: () =>
          openLedgerDetail({
            type: "source-document",
            id: result.sourceDocumentId,
            ledgerId,
          }),
      },
    });
    return;
  }

  toast.success(mode === "ai" ? messages.aiSuccess : messages.quickSuccess);
}
