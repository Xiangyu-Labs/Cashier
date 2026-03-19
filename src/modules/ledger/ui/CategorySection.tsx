"use client";

import { useEffect, useState } from "react";
import { Trash2, GripVertical, Loader2 } from "lucide-react";
import { EditableField } from "@/components/ui/editable-field";
import { IconPicker } from "@/components/ui/icon-picker";
import { type EntryCategory } from "@/types/api";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CategorySectionProps {
  categories: EntryCategory[];
  uncategorizedCount?: number;
  onCreateCategory: (name: string) => void;
  onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategories: (ids: string[]) => void;
  onCategoryCreated?: () => void;
  onAutoCategorize?: () => Promise<{ submittedCount: number; skippedCount: number }>;
}

interface SortableItemProps {
  category: EntryCategory;
  onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void;
  onDelete: () => void;
}

function SortableItem({ category, onUpdateCategory, onDelete }: SortableItemProps) {
  const t = useTranslations("Settings");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isGenerating =
    category.icon == null ||
    category.icon === "" ||
    category.description == null ||
    category.description === "";
  const isEditable = category.isEditable === undefined || category.isEditable === true;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 rounded-[var(--radius)] bg-[var(--surface2)] p-3"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="text-[var(--muted)]" size={16} />
      </div>

      <div className="flex w-8 justify-center">
        {isGenerating ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <IconPicker
            value={category.icon}
            onChange={(icon) => onUpdateCategory(category.id, { icon })}
            disabled={!isEditable}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <EditableField
            value={category.name}
            onChange={(name) => onUpdateCategory(category.id, { name })}
            disabled={!isEditable}
            displayClassName="text-sm font-medium"
            inputClassName="text-sm"
          />
          {"entryCount" in category && typeof category.entryCount === "number" && (
            <span className="shrink-0 text-[10px] font-normal text-[var(--muted)]">
              {t("categoryItemCount", { count: category.entryCount })}
            </span>
          )}
          {category.id.toString().startsWith("temp-") && (
            <span className="animate-pulse text-[10px] font-normal text-muted">{t("saving")}</span>
          )}
        </div>
        {isGenerating ? (
          <div className="animate-pulse text-xs text-primary">{t("generating")}</div>
        ) : (
          <EditableField
            value={category.description ?? ""}
            onChange={(description) => onUpdateCategory(category.id, { description })}
            placeholder={t("categoryDescription")}
            disabled={!isEditable}
            displayClassName="text-xs text-[var(--muted)]"
            inputClassName="text-xs"
          />
        )}
      </div>

      {isEditable && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-[var(--muted)] transition-colors hover:bg-surface hover:text-[var(--danger)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export function CategorySection({
  categories,
  uncategorizedCount = 0,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  onCategoryCreated,
  onAutoCategorize: _onAutoCategorize,
}: CategorySectionProps) {
  const t = useTranslations("Settings");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draggedCategories, setDraggedCategories] = useState<EntryCategory[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCreate = () => {
    if (newCategoryName.trim() === "") return;
    onCreateCategory(newCategoryName.trim());
  };

  useEffect(() => {
    if (onCategoryCreated == null) return;

    const timer = setTimeout(() => setNewCategoryName(""), 0);
    return () => clearTimeout(timer);
  }, [onCategoryCreated]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedCategories(null);

    if (over == null || active.id === over.id) return;

    const oldIndex = categories.findIndex((category) => category.id === active.id);
    const newIndex = categories.findIndex((category) => category.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    onReorderCategories(reordered.map((category) => category.id));
  };

  const handleDragOver = (event: {
    active: { id: UniqueIdentifier };
    over: { id: UniqueIdentifier } | null;
  }) => {
    const { active, over } = event;

    if (over == null || active.id === over.id || draggedCategories == null) return;

    const oldIndex = draggedCategories.findIndex((category) => category.id === active.id);
    const newIndex = draggedCategories.findIndex((category) => category.id === over.id);
    setDraggedCategories(arrayMove(draggedCategories, oldIndex, newIndex));
  };

  const displayCategories = draggedCategories ?? categories;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">{t("categories")}</h3>
        <p className="text-sm text-muted">{t("categoriesDesc")}</p>
      </div>

      <div className="mb-4 space-y-2">
        {uncategorizedCount > 0 && (
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-amber-500/20 bg-amber-500/10 p-3">
            <div className="flex w-8 justify-center">
              <span className="text-amber-600 dark:text-amber-400">!</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {t("uncategorized")}
              </div>
              <div className="text-xs text-amber-600/80 dark:text-amber-400/80">
                {t("uncategorizedDesc", { count: uncategorizedCount })}
              </div>
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setDraggedCategories([...categories])}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayCategories.map((category) => category.id)}
            strategy={verticalListSortingStrategy}
          >
            {displayCategories.map((category) => (
              <SortableItem
                key={category.id}
                category={category}
                onUpdateCategory={onUpdateCategory}
                onDelete={() => onDeleteCategory(category.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder={t("newCategoryPlaceholder")}
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && handleCreate()}
          className="flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button
          onClick={handleCreate}
          className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {t("addCategory")}
        </button>
      </div>
    </div>
  );
}
