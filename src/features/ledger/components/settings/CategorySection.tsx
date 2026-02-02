"use client";

import { useState, useEffect } from "react";
import { Trash2, Check, X, Pencil, GripVertical, Loader2 } from "lucide-react";
import { EntryCategory } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";
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
    onCreateCategory: (name: string) => void;
    onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void;
    onDeleteCategory: (id: string) => void;
    onReorderCategories: (ids: string[]) => void;
    onCategoryCreated?: () => void;
}

interface SortableItemProps {
    category: EntryCategory;
    isEditing: boolean;
    editingData: { name: string, description: string };
    onEditStart: () => void;
    onEditCancel: () => void;
    onEditChange: (data: { name: string, description: string }) => void;
    onUpdate: () => void;
    onDelete: () => void;
}

function SortableItem({
    category,
    isEditing,
    editingData,
    onEditStart,
    onEditCancel,
    onEditChange,
    onUpdate,
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-[var(--radius)] group"
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="text-[var(--muted)]" size={16} />
            </div>

            {isEditing ? (
                <div className="flex-1 flex gap-2">
                    <input
                        type="text"
                        value={editingData.name}
                        onChange={e => onEditChange({ ...editingData, name: e.target.value })}
                        className="flex-1 px-2 py-1 text-sm rounded bg-surface focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        autoFocus
                    />
                    <input
                        type="text"
                        value={editingData.description}
                        onChange={e => onEditChange({ ...editingData, description: e.target.value })}
                        placeholder={t("categoryDescription")}
                        className="flex-1 px-2 py-1 text-sm rounded bg-surface text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <button onClick={onUpdate} className="text-[var(--primary)] p-1 hover:bg-surface rounded transition-colors">
                        <Check size={16} />
                    </button>
                    <button onClick={onEditCancel} className="text-[var(--danger)] p-1 hover:bg-surface rounded transition-colors">
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <>
                    <div className="w-8 flex justify-center text-xl">
                        {(!category.icon || !category.description) ? (
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : (
                            <CategoryIcon iconName={category.icon} className="w-6 h-6" />
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                            {category.name}
                            {category.id.toString().startsWith('temp-') && (
                                <span className="text-[10px] text-muted font-normal animate-pulse">(Saving...)</span>
                            )}
                        </div>
                        {(!category.icon || !category.description) ? (
                            <div className="text-xs text-primary animate-pulse">{t("categories.generating")}</div>
                        ) : category.description && (
                            <div className="text-xs text-[var(--muted)]">{category.description}</div>
                        )}
                    </div>
                    {category.isEditable !== false && (
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                            <button
                                onClick={onEditStart}
                                className="p-1.5 text-[var(--muted)] hover:text-[var(--primary)] hover:bg-surface rounded transition-colors"
                            >
                                <Pencil size={15} />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1.5 text-[var(--muted)] hover:text-[var(--danger)] hover:bg-surface rounded transition-colors"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function CategorySection({
    categories,
    onCreateCategory,
    onUpdateCategory,
    onDeleteCategory,
    onReorderCategories,
    onCategoryCreated
}: CategorySectionProps) {
    const t = useTranslations("Settings");
    const [isEditingCategory, setIsEditingCategory] = useState<string | null>(null);
    const [editingCategoryData, setEditingCategoryData] = useState<{ name: string, description: string }>({ name: "", description: "" });
    const [newCategoryName, setNewCategoryName] = useState("");

    // 本地状态管理分类顺序（乐观更新）
    const [localCategories, setLocalCategories] = useState<EntryCategory[]>(categories);

    // 同步 props 到本地状态
    useEffect(() => {
        setLocalCategories(categories);
    }, [categories]);

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

        if (over && active.id !== over.id) {
            const oldIndex = localCategories.findIndex((c) => c.id === active.id);
            const newIndex = localCategories.findIndex((c) => c.id === over.id);

            // 乐观更新：立即更新本地状态
            const newOrderedCategories = arrayMove(localCategories, oldIndex, newIndex);
            setLocalCategories(newOrderedCategories);

            // 异步调用后端API
            onReorderCategories(newOrderedCategories.map(c => c.id));
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-medium">{t('categories')}</h3>
                <p className="text-sm text-muted">{t('categoriesDesc')}</p>
            </div>

            <div className="space-y-2 mb-4">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={localCategories.map(c => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {localCategories.map(category => (
                            <SortableItem
                                key={category.id}
                                category={category}
                                isEditing={isEditingCategory === category.id}
                                editingData={editingCategoryData}
                                onEditStart={() => {
                                    setIsEditingCategory(category.id);
                                    setEditingCategoryData({ name: category.name, description: category.description || "" });
                                }}
                                onEditCancel={() => setIsEditingCategory(null)}
                                onEditChange={setEditingCategoryData}
                                onUpdate={() => {
                                    onUpdateCategory(category.id, {
                                        name: editingCategoryData.name,
                                        description: editingCategoryData.description
                                    });
                                    setIsEditingCategory(null);
                                }}
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

