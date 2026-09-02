"use client";

import { useState } from "react";
import {
  editDraftEqual,
  type CategoryDraft,
  type EditSession,
} from "./category-draft-model";

interface UseCategoryEditSessionOptions {
  setDraftOrder: (updater: (current: CategoryDraft[]) => CategoryDraft[]) => void;
  setSaveError: (error: string | null) => void;
}

/** Owns the single-category inline edit dialog's draft-vs-original state machine. */
export function useCategoryEditSession({ setDraftOrder, setSaveError }: UseCategoryEditSessionOptions) {
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [discardEditOpen, setDiscardEditOpen] = useState(false);
  const editDirty = editSession != null && !editDraftEqual(editSession.original, editSession.draft);

  const requestEditClose = () => {
    if (editSession == null) return;
    if (editDraftEqual(editSession.original, editSession.draft)) {
      setEditSession(null);
    } else {
      setDiscardEditOpen(true);
    }
  };

  const startEditing = (category: CategoryDraft) => {
    const draft = {
      key: category.key,
      name: category.name,
      description: category.description,
      icon: category.icon,
    };
    setEditSession({ original: draft, draft });
  };

  const commitEdit = () => {
    if (editSession == null) return;
    const updated = editSession.draft;
    setDraftOrder((current) =>
      current.map((category) =>
        category.key === updated.key
          ? {
              ...category,
              name: updated.name.trim(),
              description: updated.description,
              icon: updated.icon,
            }
          : category
      )
    );
    setEditSession(null);
    setSaveError(null);
  };

  return {
    editSession,
    setEditSession,
    discardEditOpen,
    setDiscardEditOpen,
    editDirty,
    requestEditClose,
    startEditing,
    commitEdit,
  };
}
