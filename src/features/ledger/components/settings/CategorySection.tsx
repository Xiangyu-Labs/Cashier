"use client";

import { useState, useEffect } from "react";
import { Trash2, GripVertical, Loader2 } from "lucide-react";
import { EditableField } from "@/components/ui/editable-field";
import { IconPicker } from "@/components/ui/icon-picker";
import { toast } from "sonner";
import { EntryCategory } from "@/types/api";
import { useTranslations } from "next-intl";

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

function SortableItem({
    category,
    onUpdateCategory,
    onDelete
}: SortableItemProps) {
    const t = useTranslations("Settings");
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: category.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isGenerating = !category.icon || !category.description;
    const isEditable = category.isEditable !== false;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-[var(--radius)] group"
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="text-[var(--muted)]" size={16} />
            </div>

            {/* Icon Area - uses IconPicker */}
            <div className="w-8 flex justify-center">
                {isGenerating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                    <IconPicker
                        value={category.icon}
                        onChange={(icon) => onUpdateCategory(category.id, { icon })}
                        disabled={!isEditable}
                    />
                )}
            </div>

            {/* Name and Description - uses EditableField */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <EditableField
                        value={category.name}
                        onChange={(name) => onUpdateCategory(category.id, { name })}
                        disabled={!isEditable}
                        displayClassName="font-medium text-sm"
                        inputClassName="text-sm"
                    />
                    {'entryCount' in category && typeof category.entryCount === 'number' && (
                        <span className="text-[10px] text-[var(--muted)] font-normal shrink-0">{t("categoryItemCount", { count: category.entryCount })}</span>
                    )}
                    {category.id.toString().startsWith('temp-') && (
                        <span className="text-[10px] text-muted font-normal animate-pulse">{t("saving")}</span>
                    )}
                </div>
                {isGenerating ? (
                    <div className="text-xs text-primary animate-pulse">{t("generating")}</div>
                ) : (
                    <EditableField
                        value={category.description || ""}
                        onChange={(description) => onUpdateCategory(category.id, { description })}
                        placeholder={t("categoryDescription")}
                        disabled={!isEditable}
                        displayClassName="text-xs text-[var(--muted)]"
                        inputClassName="text-xs"
                    />
                )}
            </div>

            {/* Delete button only */}
            {isEditable && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-[var(--muted)] hover:text-[var(--danger)] hover:bg-surface rounded transition-colors"
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
    onAutoCategorize,
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
        if (!newCategoryName.trim()) return;
        onCreateCategory(newCategoryName.trim());
    };

    // Clear input on successful creation - listen to onCategoryCreated change
    useEffect(() => {
        if (onCategoryCreated) {
            setNewCategoryName("");
        }
    }, [onCategoryCreated]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        // Clear dragged state first
        setDraggedCategories(null);

        if (over && active.id !== over.id) {
            const oldIndex = categories.findIndex((c) => c.id === active.id);
            const newIndex = categories.findIndex((c) => c.id === over.id);

            const newOrderedCategories = arrayMove(categories, oldIndex, newIndex);

            // Call backend API with new order
            onReorderCategories(newOrderedCategories.map(c => c.id));
        }
    };

    const handleDragStart = () => {
        // Store current categories for drag preview
        setDraggedCategories([...categories]);
    };

    const handleDragOver = (event: { active: any; over: any }) => {
        const { active, over } = event;

        if (over && active.id !== over.id && draggedCategories) {
            const oldIndex = draggedCategories.findIndex((c) => c.id === active.id);
            const newIndex = draggedCategories.findIndex((c) => c.id === over.id);

            setDraggedCategories(arrayMove(draggedCategories, oldIndex, newIndex));
        }
    };

    // Use dragged categories during drag, otherwise use categories from query
    const displayCategories = draggedCategories || categories;

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-medium">{t('categories')}</h3>
                <p className="text-sm text-muted">{t('categoriesDesc')}</p>
            </div>

            <div className="space-y-2 mb-4">
                {/* Uncategorized count */}
                {uncategorizedCount > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius)]">
                        <div className="w-8 flex justify-center">
                            <span className="text-amber-600 dark:text-amber-400">⚠</span>
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-sm text-amber-700 dark:text-amber-300">
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
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={displayCategories.map(c => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {displayCategories.map(category => (
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
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    className="flex-1 p-2 text-sm bg-[var(--surface)] border border(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius)] text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    {t("addCategory")}
                </button>
            </div>
        </div>
    );
}

