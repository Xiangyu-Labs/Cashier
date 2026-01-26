"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, X, Pencil, GripVertical } from "lucide-react";
import {
    fetchSettings,
    updateSettings,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from "@/lib/api";
import { Category } from "@/types/api";

const LANGUAGES = [
    { value: "zh-CN", label: "简体中文" },
    { value: "zh-TW", label: "繁體中文" },
    { value: "en", label: "English" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
];

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [newCurrency, setNewCurrency] = useState("");
    const [isEditingCategory, setIsEditingCategory] = useState<string | null>(null);
    const [editingCategoryData, setEditingCategoryData] = useState<{ name: string, description: string }>({ name: "", description: "" });
    const [newCategoryName, setNewCategoryName] = useState("");

    // Settings Query
    const { data: settings, isLoading: isSettingsLoading } = useQuery({
        queryKey: ["settings"],
        queryFn: fetchSettings,
    });

    // Categories Query
    const { data: categories, isLoading: isCategoriesLoading } = useQuery({
        queryKey: ["categories"],
        queryFn: () => fetchCategories(),
    });

    // Mutations
    const updateSettingsMutation = useMutation({
        mutationFn: updateSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: (data: { name: string }) => createCategory("global", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            setNewCategoryName("");
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
            updateCategory("global", id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
                // Ensure other fields are handled if necessary
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            setIsEditingCategory(null);
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: string) => deleteCategory("global", id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateSettingsMutation.mutate({ language: e.target.value });
    };

    const handleAddCurrency = () => {
        if (!newCurrency || !settings) return;
        const current = settings.currencies || [];
        if (!current.includes(newCurrency.toUpperCase())) {
            updateSettingsMutation.mutate({ currencies: [...current, newCurrency.toUpperCase()] });
        }
        setNewCurrency("");
    };

    const handleRemoveCurrency = (currency: string) => {
        if (!settings) return;
        const current = settings.currencies || [];
        updateSettingsMutation.mutate({ currencies: current.filter(c => c !== currency) });
    };

    const handleCreateCategory = () => {
        if (!newCategoryName.trim()) return;
        createCategoryMutation.mutate({ name: newCategoryName.trim() });
    };

    if (isSettingsLoading || isCategoriesLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <h1 className="text-2xl font-semibold mb-6">系统设置</h1>

            {/* Language Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-4">语言设置</h2>
                <div className="flex flex-col gap-2 max-w-xs">
                    <label className="text-sm text-[var(--muted)]">首选语言</label>
                    <select
                        value={settings?.language}
                        onChange={handleLanguageChange}
                        className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang.value} value={lang.value}>{lang.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-[var(--muted)]">这会影响 AI 识别结果的语言。</p>
                </div>
            </section>

            {/* Currency Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-4">货币管理</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {settings?.currencies?.map(currency => (
                        <div key={currency} className="flex items-center gap-1 bg-[var(--surface2)] px-3 py-1 rounded-[var(--radius-sm)] text-sm">
                            <span>{currency}</span>
                            <button
                                onClick={() => handleRemoveCurrency(currency)}
                                className="text-[var(--muted)] hover:text-[var(--danger)]"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 max-w-xs">
                    <input
                        type="text"
                        placeholder="输入货币代码 (如 USD)"
                        value={newCurrency}
                        onChange={e => setNewCurrency(e.target.value)}
                        className="flex-1 p-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] uppercase"
                        maxLength={3}
                    />
                    <button
                        onClick={handleAddCurrency}
                        className="p-2 bg-[var(--surface2)] hover:bg-[var(--border)] rounded-[var(--radius)] transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </section>

            {/* Category Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-4">分类管理</h2>

                <div className="space-y-2 mb-6">
                    {categories?.map(category => (
                        <div key={category.id} className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-[var(--radius)] group">
                            <GripVertical className="text-[var(--muted)] cursor-move" size={16} />

                            {isEditingCategory === category.id ? (
                                <div className="flex-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={editingCategoryData.name}
                                        onChange={e => setEditingCategoryData({ ...editingCategoryData, name: e.target.value })}
                                        className="flex-1 px-2 py-1 text-sm rounded bg-white"
                                    />
                                    <input
                                        type="text"
                                        value={editingCategoryData.description || ""}
                                        onChange={e => setEditingCategoryData({ ...editingCategoryData, description: e.target.value })}
                                        placeholder="描述"
                                        className="flex-1 px-2 py-1 text-sm rounded bg-white text-[var(--muted)]"
                                    />
                                    <button
                                        onClick={() => updateCategoryMutation.mutate({
                                            id: category.id,
                                            data: { name: editingCategoryData.name, description: editingCategoryData.description }
                                        })}
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
                                    <div className="w-8 flex justify-center text-xl">{category.icon}</div>
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
                                            onClick={() => deleteCategoryMutation.mutate(category.id)}
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
                        onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                        className="flex-1 p-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                    <button
                        onClick={handleCreateCategory}
                        className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius)] text-sm font-medium hover:opacity-90"
                    >
                        添加分类
                    </button>
                </div>
            </section>
        </div>
    );
}
