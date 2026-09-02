"use client";

import { useEffect, useMemo, useState } from "react";
import type { useTranslations } from "next-intl";
import type { EntryCategory, SaveEntryCategoriesInput } from "@/modules/ledger/contracts";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { computeCategoryCollectionRevision } from "@/modules/ledger/category-collection-revision";

export interface CategoryDraft {
  key: string;
  id?: string;
  clientId?: string;
  name: string;
  description: string;
  icon: string | null;
  entryCount?: number;
}

export interface EditDraft {
  key: string;
  name: string;
  description: string;
  icon: string | null;
}

export interface EditSession {
  original: EditDraft;
  draft: EditDraft;
}

function toCategoryDraft(category: EntryCategory): CategoryDraft {
  return {
    key: category.id,
    id: category.id,
    name: category.name,
    description: category.description ?? "",
    icon: category.icon,
    ...("entryCount" in category && typeof category.entryCount === "number"
      ? { entryCount: category.entryCount }
      : {}),
  };
}

function categoryDraftsEqual(left: CategoryDraft[], right: CategoryDraft[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((category, index) => {
    const other = right[index];
    return (
      other != null &&
      category.key === other.key &&
      category.name === other.name &&
      category.description === other.description &&
      category.icon === other.icon
    );
  });
}

export function editDraftEqual(left: EditDraft, right: EditDraft): boolean {
  return (
    left.name === right.name && left.description === right.description && left.icon === right.icon
  );
}

interface UseCategoryManagementDraftOptions {
  categories: EntryCategory[];
  onSaveCategories: (input: SaveEntryCategoriesInput) => Promise<EntryCategory[]>;
  onReloadCategories?: (() => Promise<EntryCategory[]>) | undefined;
  isSaving: boolean;
  t: ReturnType<typeof useTranslations>;
}

/** Owns the category list's draft/server-sync state machine and save/reload flow. */
export function useCategoryManagementDraft({
  categories,
  onSaveCategories,
  onReloadCategories,
  isSaving,
  t,
}: UseCategoryManagementDraftOptions) {
  const [managing, setManaging] = useState(false);
  const [serverDraft, setServerDraft] = useState<CategoryDraft[]>([]);
  const [draftOrder, setDraftOrder] = useState<CategoryDraft[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryDraft | null>(null);
  const [discardManagementOpen, setDiscardManagementOpen] = useState(false);
  const [discardEditOpen, setDiscardEditOpen] = useState(false);
  const [serverChanged, setServerChanged] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const incomingDraft = useMemo(() => categories.map(toCategoryDraft), [categories]);
  const dirty = managing && !categoryDraftsEqual(serverDraft, draftOrder);
  const editDirty = editSession != null && !editDraftEqual(editSession.original, editSession.draft);
  const hasCategoryDraft = dirty || newCategoryName.trim() !== "" || editDirty;

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

  useEffect(() => {
    const key = "settings:categories";
    useUnsavedChangesStore.getState().setDirty(key, hasCategoryDraft);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [hasCategoryDraft]);

  const displayedCategories = managing ? draftOrder : incomingDraft;

  const enterManagement = () => {
    setServerDraft(incomingDraft);
    setDraftOrder(incomingDraft);
    setManaging(true);
    setServerChanged(false);
    setRevisionConflict(false);
    setSaveError(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    setDraftOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item == null) return current;
      next.splice(target, 0, item);
      return next;
    });
    setSaveError(null);
  };

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (name === "" || isSaving) return;
    const clientId = crypto.randomUUID();
    setDraftOrder((current) => [
      ...current,
      {
        key: clientId,
        clientId,
        name,
        description: "",
        icon: null,
      },
    ]);
    setNewCategoryName("");
    setSaveError(null);
  };

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

  const cancelManagement = () => {
    if (hasCategoryDraft) setDiscardManagementOpen(true);
    else setManaging(false);
  };

  const confirmDiscardManagement = () => {
    setDraftOrder(serverDraft);
    setNewCategoryName("");
    setEditSession(null);
    setManaging(false);
    setServerChanged(false);
    setRevisionConflict(false);
    setSaveError(null);
  };

  const confirmDeleteCategory = () => {
    if (deleteTarget == null) return;
    setDraftOrder((current) => current.filter((category) => category.key !== deleteTarget.key));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!dirty || isSaving || revisionConflict || serverChanged) return;
    setSaveError(null);
    try {
      const expectedRevision = await computeCategoryCollectionRevision(categories);
      const saved = await onSaveCategories({
        expectedRevision,
        categories: draftOrder.map((category) => ({
          ...(category.id === undefined ? {} : { id: category.id }),
          ...(category.clientId === undefined ? {} : { clientId: category.clientId }),
          name: category.name.trim(),
          description: category.description.trim() || null,
          icon: category.icon,
        })),
      });
      const savedDraft = saved.map(toCategoryDraft);
      setServerDraft(savedDraft);
      setDraftOrder(savedDraft);
      setManaging(false);
      setServerChanged(false);
      setRevisionConflict(false);
    } catch (error) {
      const errorCode =
        typeof error === "object" && error != null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (errorCode === "CONFLICT") {
        setRevisionConflict(true);
        setServerChanged(true);
        setSaveError(t("updateConflict"));
      } else {
        setSaveError(t("saveCategoriesFailed"));
      }
    }
  };

  const handleReload = async () => {
    if (onReloadCategories == null) return;
    try {
      const latest = await onReloadCategories();
      const latestDraft = latest.map(toCategoryDraft);
      setServerDraft(latestDraft);
      setDraftOrder(latestDraft);
      setNewCategoryName("");
      setEditSession(null);
      setManaging(false);
      setServerChanged(false);
      setRevisionConflict(false);
      setSaveError(null);
    } catch {
      setSaveError(t("saveCategoriesFailed"));
    }
  };

  return {
    managing,
    newCategoryName,
    setNewCategoryName,
    editSession,
    setEditSession,
    deleteTarget,
    setDeleteTarget,
    discardManagementOpen,
    setDiscardManagementOpen,
    discardEditOpen,
    setDiscardEditOpen,
    serverChanged,
    revisionConflict,
    saveError,
    dirty,
    displayedCategories,
    enterManagement,
    move,
    createCategory,
    requestEditClose,
    handleSave,
    handleReload,
    startEditing,
    commitEdit,
    cancelManagement,
    confirmDiscardManagement,
    confirmDeleteCategory,
  };
}
