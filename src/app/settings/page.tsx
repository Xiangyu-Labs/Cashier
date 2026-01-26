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
import { CurrencySection } from "./components/CurrencySection";
import { CategorySection } from "./components/CategorySection";
import { Category } from "@/types/api";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";



export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [showAutoConfirmWarning, setShowAutoConfirmWarning] = useState(false);

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
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
            updateCategory("global", id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: string) => deleteCategory("global", id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

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

            {/* AI Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-6">智能助理</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-medium">跳过核对</h3>
                        <p className="text-sm text-[var(--muted)]">AI 识别的账单直接入账，不再需要手动确认</p>
                    </div>
                    <Switch
                        checked={settings?.autoConfirm || false}
                        onCheckedChange={(checked: boolean) => {
                            if (checked) {
                                setShowAutoConfirmWarning(true);
                            } else {
                                updateSettingsMutation.mutate({ autoConfirm: false });
                            }
                        }}
                    />
                </div>
            </section>

            <Dialog open={showAutoConfirmWarning} onOpenChange={setShowAutoConfirmWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-danger flex items-center gap-2">
                            ⚠️ 风险提示
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-sm text-[var(--muted)] space-y-3">
                        <p>开启「跳过核对」后，AI 识别的所有账单将<strong>直接计入账本</strong>。</p>
                        <p>虽然 AI 准确率很高，但仍可能出现识别错误（如金额、分类错误）。开启此功能意味着您接受可能存在的记账误差。</p>
                        <p>建议您定期（如每周）查看账单列表，检查是否有异常记录。</p>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="ghost" onClick={() => setShowAutoConfirmWarning(false)}>
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                updateSettingsMutation.mutate({ autoConfirm: true });
                                setShowAutoConfirmWarning(false);
                            }}
                        >
                            确认开启
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Data Configuration */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-6">数据配置</h2>

                <div className="space-y-8">
                    {/* Currency Settings */}
                    {settings && (
                        <CurrencySection
                            settings={settings}
                            onUpdateSettings={updateSettingsMutation.mutate}
                        />
                    )}

                    <div className="h-px bg-[var(--border)]" />

                    {/* Category Settings */}
                    {categories && (
                        <CategorySection
                            categories={categories}
                            onCreateCategory={(name) => createCategoryMutation.mutate({ name })}
                            onUpdateCategory={(id, data) => updateCategoryMutation.mutate({ id, data })}
                            onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                        />
                    )}
                </div>
            </section>
        </div>
    );
}
