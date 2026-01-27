"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchLedger,
    updateLedger,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from "@/lib/api";
import { CurrencySection } from "./components/CurrencySection";
import { CategorySection } from "./components/CategorySection";
import { Category, Ledger } from "@/types/api";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LedgerSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const ledgerId = params.id as string;
    const queryClient = useQueryClient();
    const [showAutoConfirmWarning, setShowAutoConfirmWarning] = useState(false);

    // Ledger Query
    const { data: ledger, isLoading: isLedgerLoading } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => fetchLedger(ledgerId),
    });

    // Categories Query
    const { data: categories, isLoading: isCategoriesLoading } = useQuery({
        queryKey: ["categories", ledgerId],
        queryFn: () => fetchCategories(ledgerId),
    });

    // Mutations
    const updateLedgerMutation = useMutation({
        mutationFn: (data: Partial<Ledger>) => updateLedger(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: (data: { name: string }) => createCategory(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
            updateCategory(ledgerId, id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: string) => deleteCategory(ledgerId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
        },
    });

    if (isLedgerLoading || isCategoriesLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
        );
    }

    if (!ledger) return <div>Ledger not found</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-2xl font-semibold">账本设置 - {ledger.name}</h1>
            </div>

            {/* AI Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                <h2 className="text-lg font-medium mb-6">智能助理</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-medium">跳过核对</h3>
                        <p className="text-sm text-[var(--muted)]">AI 识别的账单直接入账，不再需要手动确认</p>
                    </div>
                    <Switch
                        checked={ledger.autoConfirm || false}
                        onCheckedChange={(checked: boolean) => {
                            if (checked) {
                                setShowAutoConfirmWarning(true);
                            } else {
                                updateLedgerMutation.mutate({ autoConfirm: false });
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
                                updateLedgerMutation.mutate({ autoConfirm: true });
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
                    <CurrencySection
                        // Adapt CurrencySection to accept ledger structure which is compatible with Settings for these fields
                        settings={ledger as any}
                        onUpdateSettings={(data) => updateLedgerMutation.mutate(data)}
                    />

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
