"use client";

import { useState } from "react";
import { Trash2, Check, X, Pencil, GripVertical } from "lucide-react";
import { EntryCategory } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";

interface CategorySectionProps {
    categories: EntryCategory[];
    onCreateCategory: (name: string) => void;
    onUpdateCategory: (id: string, data: Partial<EntryCategory>) => void;
    onDeleteCategory: (id: string) => void;
}

export function CategorySection({ categories, onCreateCategory, onUpdateCategory, onDeleteCategory }: CategorySectionProps) {
    const [isEditingCategory, setIsEditingCategory] = useState<string | null>(null);
    const [editingCategoryData, setEditingCategoryData] = useState<{ name: string, description: string }>({ name: "", description: "" });
    const [newCategoryName, setNewCategoryName] = useState("");

    const handleCreate = () => {
        if (!newCategoryName.trim()) return;
        onCreateCategory(newCategoryName.trim());
        setNewCategoryName("");
    };

    return (
        <div>
            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">分类</h3>

            <div className="space-y-2 mb-4">
                {categories.map(category => (
                    <div key={category.id} className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-[var(--radius)] group">
                        <GripVertical className="text-[var(--muted)] cursor-move" size={16} />

                        {isEditingCategory === category.id ? (
                            <div className="flex-1 flex gap-2">
                                <input
                                    type="text"
                                    value={editingCategoryData.name}
                                    onChange={e => setEditingCategoryData({ ...editingCategoryData, name: e.target.value })}
                                    className="flex-1 px-2 py-1 text-sm rounded bg-surface"
                                />
                                <input
                                    type="text"
                                    value={editingCategoryData.description || ""}
                                    onChange={e => setEditingCategoryData({ ...editingCategoryData, description: e.target.value })}
                                    placeholder="描述"
                                    className="flex-1 px-2 py-1 text-sm rounded bg-surface text-[var(--muted)]"
                                />
                                <button
                                    onClick={() => {
                                        onUpdateCategory(category.id, {
                                            name: editingCategoryData.name,
                                            description: editingCategoryData.description
                                        });
                                        setIsEditingCategory(null);
                                    }}
                                    className="text-[var(--primary)]"
                                >
                                    <Check size={16} />
                                </button>
                                <button
                                    onClick={() => setIsEditingCategory(null)}
                                    className="text-[var(--danger)]"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="w-8 flex justify-center text-xl">
                                    <CategoryIcon iconName={category.icon} className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium text-sm">{category.name}</div>
                                    {category.description && <div className="text-xs text-[var(--muted)]">{category.description}</div>}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 flex gap-2">
                                    <button
                                        onClick={() => {
                                            setIsEditingCategory(category.id);
                                            setEditingCategoryData({ name: category.name, description: category.description || "" });
                                        }}
                                        className="p-1 text-[var(--muted)] hover:text-[var(--primary)]"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => onDeleteCategory(category.id)}
                                        className="p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="新分类名称"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    className="flex-1 p-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius)] text-sm font-medium hover:opacity-90"
                >
                    添加分类
                </button>
            </div>
        </div>
    );
}
