"use client";

import { useMemo, useState } from "react";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { categoryDraftsEqual, toCategoryDraft, type CategoryDraft } from "./category-draft-model";

interface UseCategoryDraftSyncOptions {
  categories: EntryCategory[];
  managing: boolean;
  serverDraft: CategoryDraft[];
  setServerDraft: (drafts: CategoryDraft[]) => void;
  setDraftOrder: (drafts: CategoryDraft[]) => void;
  hasCategoryDraft: boolean;
}

/**
 * Reconciles incoming server categories against the in-progress draft while
 * `managing` is active: applies server changes straight through when the
 * draft has no local edits, or flags a conflict when it does.
 */
export function useCategoryDraftSync({
  categories,
  managing,
  serverDraft,
  setServerDraft,
  setDraftOrder,
  hasCategoryDraft,
}: UseCategoryDraftSyncOptions) {
  const [serverChanged, setServerChanged] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const incomingDraft = useMemo(() => categories.map(toCategoryDraft), [categories]);

  if (managing && !categoryDraftsEqual(serverDraft, incomingDraft)) {
    setServerDraft(incomingDraft);
    if (hasCategoryDraft) {
      setServerChanged(true);
      setRevisionConflict(true);
    } else {
      setDraftOrder(incomingDraft);
      setServerChanged(false);
      setRevisionConflict(false);
    }
  }

  const resetSyncState = () => {
    setServerChanged(false);
    setRevisionConflict(false);
  };

  return {
    incomingDraft,
    serverChanged,
    setServerChanged,
    revisionConflict,
    setRevisionConflict,
    resetSyncState,
  };
}
