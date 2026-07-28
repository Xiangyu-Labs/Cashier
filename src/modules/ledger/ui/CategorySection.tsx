"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EntryCategory } from "@/modules/ledger/contracts";
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

interface CategorySectionProps {
  categories: EntryCategory[];
  uncategorizedCount?: number;
  onCreateCategory: (name: string) => Promise<EntryCategory>;
  onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void | Promise<unknown>;
  onDeleteCategory: (id: string) => void | Promise<unknown>;
  onReorderCategories: (ids: string[]) => void | Promise<unknown>;
  generatingCategoryIds?: Set<string>;
  failedCategoryIds?: Set<string>;
  onRetryMetadata?: (id: string) => void;
  isReordering?: boolean;
  isCreating?: boolean;
}

interface EditDraft {
  id: string;
  name: string;
  description: string;
  icon: string | null;
}

export function CategorySection({
  categories,
  uncategorizedCount = 0,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  generatingCategoryIds = new Set(),
  failedCategoryIds = new Set(),
  onRetryMetadata,
  isReordering = false,
  isCreating = false,
}: CategorySectionProps) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [managing, setManaging] = useState(false);
  const [draftOrder, setDraftOrder] = useState<EntryCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntryCategory | null>(null);

  const displayedCategories = managing ? draftOrder : categories;
  const orderChanged = useMemo(
    () =>
      managing &&
      draftOrder.map((category) => category.id).join("|") !==
        categories.map((category) => category.id).join("|"),
    [categories, draftOrder, managing]
  );

  const enterManagement = () => {
    setDraftOrder([...categories]);
    setManaging(true);
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
  };

  const saveOrder = async () => {
    await onReorderCategories(draftOrder.map((category) => category.id));
    setManaging(false);
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (name === "" || isCreating) return;
    const category = await onCreateCategory(name);
    setDraftOrder((current) =>
      current.some((item) => item.id === category.id) ? current : [...current, category]
    );
    setNewCategoryName("");
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
            <Settings2 className="mr-1.5 h-4 w-4" />
            {t("manageCategories")}
          </Button>
        ) : null}
      </div>

      {uncategorizedCount > 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
          <span className="flex h-8 w-8 items-center justify-center text-amber-600">!</span>
          <div>
            <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {t("uncategorized")}
            </div>
            <div className="text-xs text-amber-600/80 dark:text-amber-400/80">
              {t("uncategorizedDesc", { count: uncategorizedCount })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {displayedCategories.map((category, index) => (
          <div
            key={category.id}
            className="flex min-h-14 items-center gap-3 rounded-md bg-surface2 p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <CategoryIcon iconName={category.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{category.name}</span>
                {"entryCount" in category && typeof category.entryCount === "number" ? (
                  <span className="text-[10px] text-muted">
                    {t("categoryItemCount", { count: category.entryCount })}
                  </span>
                ) : null}
                {generatingCategoryIds.has(category.id) ? (
                  <span className="text-[10px] text-muted">{t("generatingMetadata")}</span>
                ) : null}
                {failedCategoryIds.has(category.id) && onRetryMetadata != null ? (
                  <button
                    type="button"
                    onClick={() => onRetryMetadata(category.id)}
                    className="inline-flex items-center gap-1 text-[10px] text-danger"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {t("retryMetadata")}
                  </button>
                ) : null}
              </div>
              {category.description ? (
                <p className="truncate text-xs text-muted">{category.description}</p>
              ) : null}
            </div>
            {managing ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === 0 || isReordering}
                  onClick={() => move(index, -1)}
                  aria-label={t("moveCategoryUp", { name: category.name })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === displayedCategories.length - 1 || isReordering}
                  onClick={() => move(index, 1)}
                  aria-label={t("moveCategoryDown", { name: category.name })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setEditDraft({
                      id: category.id,
                      name: category.name,
                      description: category.description ?? "",
                      icon: category.icon,
                    })
                  }
                  aria-label={t("editCategory", { name: category.name })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-danger"
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
                if (event.key === "Enter") void createCategory();
              }}
              aria-label={t("newCategoryPlaceholder")}
              placeholder={t("newCategoryPlaceholder")}
            />
            <Button
              type="button"
              onClick={() => void createCategory()}
              disabled={newCategoryName.trim() === "" || isCreating}
            >
              {t("addCategory")}
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isReordering}
              onClick={() => setManaging(false)}
            >
              {common("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!orderChanged || isReordering}
              onClick={async () => {
                try {
                  await saveOrder();
                } catch {
                  // The mutation reports the error and the draft remains available to retry.
                }
              }}
            >
              {isReordering ? t("savingOrder") : t("saveOrder")}
            </Button>
          </div>
        </>
      ) : null}

      <Dialog open={editDraft != null} onOpenChange={(open) => !open && setEditDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editCategoryDialog")}</DialogTitle>
          </DialogHeader>
          {editDraft != null ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <IconPicker
                  value={editDraft.icon}
                  onChange={(icon) => setEditDraft((draft) => (draft ? { ...draft, icon } : draft))}
                />
                <Input
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft((draft) =>
                      draft ? { ...draft, name: event.target.value } : draft
                    )
                  }
                  aria-label={t("categoryName")}
                />
              </div>
              <textarea
                value={editDraft.description}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, description: event.target.value } : draft
                  )
                }
                aria-label={t("categoryDescription")}
                className="min-h-24 w-full rounded-md border border-border bg-bg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDraft(null)}>
              {common("cancel")}
            </Button>
            <Button
              type="button"
              disabled={editDraft?.name.trim() === ""}
              onClick={async () => {
                if (editDraft == null) return;
                await onUpdateCategory(editDraft.id, {
                  name: editDraft.name.trim(),
                  description: editDraft.description.trim() || null,
                  icon: editDraft.icon,
                });
                setEditDraft(null);
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
        onConfirm={async () => {
          if (deleteTarget == null) return;
          await onDeleteCategory(deleteTarget.id);
          setDraftOrder((current) => current.filter((item) => item.id !== deleteTarget.id));
        }}
      />
    </div>
  );
}
