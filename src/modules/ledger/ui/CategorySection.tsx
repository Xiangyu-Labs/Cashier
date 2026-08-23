"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EntryCategory, SaveEntryCategoriesInput } from "@/modules/ledger/contracts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { computeCategoryCollectionRevision } from "@/modules/ledger/category-collection-revision";

interface CategorySectionProps {
  categories: EntryCategory[];
  uncategorizedCount?: number;
  onSaveCategories: (input: SaveEntryCategoriesInput) => Promise<EntryCategory[]>;
  generatingCategoryIds?: Set<string>;
  failedCategoryIds?: Set<string>;
  onRetryMetadata?: (id: string) => void;
  isSaving?: boolean;
}

interface CategoryDraft {
  key: string;
  id?: string;
  clientId?: string;
  name: string;
  description: string;
  icon: string | null;
  entryCount?: number;
}

interface EditDraft {
  key: string;
  name: string;
  description: string;
  icon: string | null;
}

interface EditSession {
  original: EditDraft;
  draft: EditDraft;
}

export function CategorySection({
  categories,
  uncategorizedCount = 0,
  onSaveCategories,
  generatingCategoryIds = new Set(),
  failedCategoryIds = new Set(),
  onRetryMetadata,
  isSaving = false,
}: CategorySectionProps) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [managing, setManaging] = useState(false);
  const [serverDraft, setServerDraft] = useState<CategoryDraft[]>([]);
  const [draftOrder, setDraftOrder] = useState<CategoryDraft[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryDraft | null>(null);
  const [discardManagementOpen, setDiscardManagementOpen] = useState(false);
  const [discardEditOpen, setDiscardEditOpen] = useState(false);
  const [serverChanged, setServerChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const incomingDraft = useMemo(() => categories.map(toCategoryDraft), [categories]);
  const dirty = managing && !categoryDraftsEqual(serverDraft, draftOrder);

  useEffect(() => {
    if (!managing || categoryDraftsEqual(serverDraft, incomingDraft)) return;
    setServerDraft(incomingDraft);
    if (dirty) {
      setServerChanged(true);
    } else {
      setDraftOrder(incomingDraft);
      setServerChanged(false);
    }
  }, [dirty, incomingDraft, managing, serverDraft]);

  useEffect(() => {
    const key = "settings:categories";
    useUnsavedChangesStore.getState().setDirty(key, dirty);
    return () => useUnsavedChangesStore.getState().setDirty(key, false);
  }, [dirty]);

  const displayedCategories = managing ? draftOrder : incomingDraft;

  const enterManagement = () => {
    setServerDraft(incomingDraft);
    setDraftOrder(incomingDraft);
    setManaging(true);
    setServerChanged(false);
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

  const handleSave = async () => {
    if (!dirty || isSaving) return;
    setSaveError(null);
    try {
      const expectedRevision = await computeCategoryCollectionRevision(categories);
      await onSaveCategories({
        expectedRevision,
        categories: draftOrder.map((category) => ({
          ...(category.id === undefined ? {} : { id: category.id }),
          ...(category.clientId === undefined ? {} : { clientId: category.clientId }),
          name: category.name.trim(),
          description: category.description.trim() || null,
          icon: category.icon,
        })),
      });
      setManaging(false);
      setServerChanged(false);
    } catch {
      setSaveError(t("saveCategoriesFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text">{t("categories")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("categoriesDesc")}</p>
        </div>
        {!managing ? (
          <Button type="button" variant="outline" size="sm" onClick={enterManagement}>
            {t("manageCategories")}
          </Button>
        ) : null}
      </div>

      {uncategorizedCount > 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 p-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <div>
            <div className="text-sm font-medium text-warning">{t("uncategorized")}</div>
            <div className="text-xs text-warning/80">
              {t("uncategorizedDesc", { count: uncategorizedCount })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {displayedCategories.map((category, index) => (
          <div
            key={category.key}
            className="flex min-h-14 items-center gap-3 rounded-md bg-surface2 p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <CategoryIcon iconName={category.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{category.name}</span>
                {category.entryCount == null ? null : (
                  <span className="text-[10px] text-muted">
                    {t("categoryItemCount", { count: category.entryCount })}
                  </span>
                )}
                {category.id != null && generatingCategoryIds.has(category.id) ? (
                  <span className="text-[10px] text-muted">{t("generatingMetadata")}</span>
                ) : null}
                {category.id != null &&
                failedCategoryIds.has(category.id) &&
                onRetryMetadata != null ? (
                  <Button
                    type="button"
                    onClick={() => onRetryMetadata(category.id!)}
                    variant="ghost"
                    size="sm"
                    className="min-h-11 px-2 text-[10px] text-danger"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {t("retryMetadata")}
                  </Button>
                ) : null}
              </div>
              {category.description !== "" ? (
                <p className="truncate text-xs text-muted">{category.description}</p>
              ) : null}
            </div>
            {managing ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={index === 0 || isSaving}
                  onClick={() => move(index, -1)}
                  aria-label={t("moveCategoryUp", { name: category.name })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={index === displayedCategories.length - 1 || isSaving}
                  onClick={() => move(index, 1)}
                  aria-label={t("moveCategoryDown", { name: category.name })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={isSaving}
                  onClick={() => {
                    const draft = {
                      key: category.key,
                      name: category.name,
                      description: category.description,
                      icon: category.icon,
                    };
                    setEditSession({ original: draft, draft });
                  }}
                  aria-label={t("editCategory", { name: category.name })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-danger"
                  disabled={isSaving}
                  onClick={() => setDeleteTarget(category)}
                  aria-label={t("deleteCategory", { name: category.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {managing ? (
        <>
          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createCategory();
                }
              }}
              disabled={isSaving}
              aria-label={t("newCategoryPlaceholder")}
              placeholder={t("newCategoryPlaceholder")}
            />
            <Button
              type="button"
              onClick={createCategory}
              disabled={newCategoryName.trim() === "" || isSaving}
            >
              {t("addCategory")}
            </Button>
          </div>
          <div aria-live="polite" className="text-sm">
            {saveError == null ? null : <p className="text-destructive">{saveError}</p>}
            {saveError == null && serverChanged ? (
              <p className="text-warning">{t("serverChangedWhileEditing")}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                if (dirty) setDiscardManagementOpen(true);
                else setManaging(false);
              }}
            >
              {common("cancel")}
            </Button>
            <Button type="button" disabled={!dirty || isSaving} onClick={() => void handleSave()}>
              {isSaving ? t("saving") : common("save")}
            </Button>
          </div>
        </>
      ) : null}

      <Dialog open={editSession != null} onOpenChange={(open) => !open && requestEditClose()}>
        <DialogContent variant="modal">
          <DialogHeader>
            <DialogTitle>{t("editCategoryDialog")}</DialogTitle>
          </DialogHeader>
          {editSession == null ? null : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <IconPicker
                  value={editSession.draft.icon}
                  messages={{
                    select: t("selectIcon"),
                    selected: (name) => t("selectedIcon", { name }),
                    list: t("icons"),
                    iconNames: {
                      Utensils: t("iconNames.Utensils"),
                      Coffee: t("iconNames.Coffee"),
                      Wine: t("iconNames.Wine"),
                      ShoppingBag: t("iconNames.ShoppingBag"),
                      ShoppingCart: t("iconNames.ShoppingCart"),
                      Shirt: t("iconNames.Shirt"),
                      Gamepad2: t("iconNames.Gamepad2"),
                      Music: t("iconNames.Music"),
                      Ticket: t("iconNames.Ticket"),
                      Film: t("iconNames.Film"),
                      Bus: t("iconNames.Bus"),
                      Car: t("iconNames.Car"),
                      TrainFront: t("iconNames.TrainFront"),
                      Plane: t("iconNames.Plane"),
                      Bike: t("iconNames.Bike"),
                      Stethoscope: t("iconNames.Stethoscope"),
                      Heart: t("iconNames.Heart"),
                      House: t("iconNames.House"),
                      Building: t("iconNames.Building"),
                      Key: t("iconNames.Key"),
                      Book: t("iconNames.Book"),
                      GraduationCap: t("iconNames.GraduationCap"),
                      Laptop: t("iconNames.Laptop"),
                      Phone: t("iconNames.Phone"),
                      Camera: t("iconNames.Camera"),
                      Headphones: t("iconNames.Headphones"),
                      Wifi: t("iconNames.Wifi"),
                      Wallet: t("iconNames.Wallet"),
                      CreditCard: t("iconNames.CreditCard"),
                      Banknote: t("iconNames.Banknote"),
                      Receipt: t("iconNames.Receipt"),
                      PiggyBank: t("iconNames.PiggyBank"),
                      Briefcase: t("iconNames.Briefcase"),
                      Hammer: t("iconNames.Hammer"),
                      Dumbbell: t("iconNames.Dumbbell"),
                      Baby: t("iconNames.Baby"),
                      Dog: t("iconNames.Dog"),
                      Gift: t("iconNames.Gift"),
                      Glasses: t("iconNames.Glasses"),
                      Umbrella: t("iconNames.Umbrella"),
                      Watch: t("iconNames.Watch"),
                      Hotel: t("iconNames.Hotel"),
                      MapPin: t("iconNames.MapPin"),
                      Luggage: t("iconNames.Luggage"),
                      Crown: t("iconNames.Crown"),
                      Star: t("iconNames.Star"),
                      Lightbulb: t("iconNames.Lightbulb"),
                      Palette: t("iconNames.Palette"),
                      Scissors: t("iconNames.Scissors"),
                      Tag: t("iconNames.Tag"),
                      Truck: t("iconNames.Truck"),
                      Zap: t("iconNames.Zap"),
                      Package: t("iconNames.Package"),
                    },
                  }}
                  onChange={(icon) =>
                    setEditSession((session) =>
                      session == null ? null : { ...session, draft: { ...session.draft, icon } }
                    )
                  }
                />
                <Input
                  value={editSession.draft.name}
                  onChange={(event) =>
                    setEditSession((session) =>
                      session == null
                        ? null
                        : {
                            ...session,
                            draft: { ...session.draft, name: event.target.value },
                          }
                    )
                  }
                  aria-label={t("categoryName")}
                />
              </div>
              <Textarea
                value={editSession.draft.description}
                onChange={(event) =>
                  setEditSession((session) =>
                    session == null
                      ? null
                      : {
                          ...session,
                          draft: { ...session.draft, description: event.target.value },
                        }
                  )
                }
                aria-label={t("categoryDescription")}
                className="min-h-24 w-full"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestEditClose}>
              {common("cancel")}
            </Button>
            <Button
              type="button"
              disabled={editSession?.draft.name.trim() === ""}
              onClick={() => {
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
              }}
            >
              {common("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteCategoryDialog")}
        description={t("deleteCategoryDescription", { name: deleteTarget?.name ?? "" })}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget == null) return;
          setDraftOrder((current) =>
            current.filter((category) => category.key !== deleteTarget.key)
          );
          setSaveError(null);
        }}
      />

      <ConfirmDialog
        open={discardManagementOpen}
        onOpenChange={setDiscardManagementOpen}
        title={t("discardCategoryChangesTitle")}
        description={t("discardCategoryChangesDescription")}
        variant="destructive"
        confirmLabel={common("discard")}
        onConfirm={() => {
          setDraftOrder(serverDraft);
          setManaging(false);
          setServerChanged(false);
          setSaveError(null);
        }}
      />

      <ConfirmDialog
        open={discardEditOpen}
        onOpenChange={setDiscardEditOpen}
        title={t("discardCategoryEditTitle")}
        description={t("discardCategoryEditDescription")}
        variant="destructive"
        confirmLabel={common("discard")}
        onConfirm={() => setEditSession(null)}
      />
    </div>
  );
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

function editDraftEqual(left: EditDraft, right: EditDraft): boolean {
  return (
    left.name === right.name && left.description === right.description && left.icon === right.icon
  );
}
