"use client";

import React, { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { ArrowLeft, Plus, Pencil, Trash2, Info, Loader2 } from "lucide-react";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
    getEntryCategoriesAction
} from "@/features/ledger/server/actions/categories";
import { EntryCategory } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { CategoryIcon } from "@/components/CategoryIcon";

interface CategoriesPageClientProps {
    ledgerId: string;
    categories: EntryCategory[];
}

interface CreateCategoryData {
    name: string;
    description?: string;
    icon?: string;
}

export function CategoriesPageClient({ ledgerId, categories: initialCategories }: CategoriesPageClientProps): React.ReactElement {
    const router = useRouter();
    const t = useTranslations();
    const queryClient = useQueryClient();
    const queryKey = ["ledger-categories", ledgerId];

    // --- Data Fetching & Polling ---

    // Use Smart Polling to handle both initial fetch and background updates for AI generation
    // This replaces a standard useQuery but serves the same purpose + polling logic
    const { data: categories = [] } = useSmartPolling<EntryCategory[]>({
        queryKey: queryKey,
        queryFn: () => getEntryCategoriesAction(ledgerId),
        isActive: (data) => data?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        initialData: initialCategories
    });

    // --- Mutations with Optimistic Updates ---

    const createMutation = useMutation({
        mutationFn: async (data: CreateCategoryData) => {
            const result = await createEntryCategoryAction(ledgerId, data);
            if (result.success) {
                return result.data;
            }
            throw new Error(result.error || "Failed to create category");
        },
        onMutate: async (newData) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey });

            // Snapshot previous value
            const previousCategories = queryClient.getQueryData<EntryCategory[]>(queryKey);

            // Optimistically update
            queryClient.setQueryData<EntryCategory[]>(queryKey, (old = []) => {
                const tempCategory: EntryCategory = {
                    id: `temp-${Date.now()}`,
                    ledgerId,
                    name: newData.name,
                    description: newData.description || null,
                    icon: newData.icon || null,
                    sortOrder: 0,
                    isEditable: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                };
                return [...old, tempCategory];
            });

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success("Category created successfully");
            handleClose();
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(queryKey, context?.previousCategories);
            toast.error(err.message);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: CreateCategoryData }) => {
            const result = await updateEntryCategoryAction(ledgerId, id, data);
            if (result.success) {
                // Ensure we return something consistent, though we might not use it in onSettled
                // updateEntryCategoryAction returns { success: true } without data usually
                // but let's check carefully. If it returns { success: true }, we can return null or the ID.
                return { id, ...data };
            }
            throw new Error(result.error || "Failed to update category");
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategory[]>(queryKey);

            queryClient.setQueryData<EntryCategory[]>(queryKey, (old = []) =>
                old.map(c => c.id === id ? { ...c, ...data, description: data.description || null, icon: data.icon || null } : c)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success("Updated successfully");
            handleClose();
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(queryKey, context?.previousCategories);
            toast.error(err.message);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteEntryCategoryAction(ledgerId, id);
            if (!result.success) throw new Error(result.error || "Failed to delete category");
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategory[]>(queryKey);

            queryClient.setQueryData<EntryCategory[]>(queryKey, (old = []) =>
                old.filter(c => c.id !== id)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success("Deleted successfully");
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(queryKey, context?.previousCategories);
            toast.error(err.message);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });


    // --- Local State ---

    const [isOpen, setIsOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<EntryCategory | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        icon: "",
    });
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        id: string | null;
        name: string;
    }>({
        open: false,
        id: null,
        name: "",
    });

    const resetForm = () => {
        setFormData({ name: "", description: "", icon: "" });
    };

    const handleClose = () => {
        setIsOpen(false);
        setEditingCategory(null);
        resetForm();
    };

    const handleSave = () => {
        if (!formData.name.trim()) return;

        const data = {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            icon: formData.icon.trim() || undefined,
        };

        if (editingCategory) {
            updateMutation.mutate({ id: editingCategory.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (category: EntryCategory) => {
        setDeleteConfirm({
            open: true,
            id: category.id,
            name: category.name,
        });
    };

    const handleConfirmDelete = () => {
        if (deleteConfirm.id) {
            deleteMutation.mutate(deleteConfirm.id);
        }
    };

    const openCreateModal = () => {
        resetForm();
        setEditingCategory(null);
        setIsOpen(true);
    };

    const openEditModal = (category: EntryCategory) => {
        setEditingCategory(category);
        setFormData({
            name: category.name,
            description: category.description || "",
            icon: category.icon || "",
        });
        setIsOpen(true);
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="min-h-screen bg-bg text-text font-sans">
            {/* 顶部导航 */}
            <header className="bg-surface border-b border-border sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/ledger/${ledgerId}`}
                            className="text-muted hover:text-text transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-xl font-bold">分类管理</h1>
                    </div>
                    <Button onClick={openCreateModal}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Category
                    </Button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 space-y-6">
                <Card>
                    <CardContent className="p-0">
                        {categories && categories.length > 0 ? (
                            <div className="divide-y divide-border">
                                {categories.map((category) => (
                                    <div
                                        key={category.id}
                                        className="p-4 flex items-center justify-between hover:bg-surface2 transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-xl shrink-0">
                                                {/* 如果正在生成中(缺少icon或描述)，显示Loading。否则显示icon */}
                                                {(!category.icon || !category.description) ? (
                                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                                ) : (
                                                    <CategoryIcon iconName={category.icon} className="w-5 h-5" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium flex items-center gap-2">
                                                    {category.name}
                                                    {/* 只有当这是临时创建的条目时，才显示保存中状态 */}
                                                    {category.id.startsWith("temp-") && (
                                                        <span className="text-xs text-muted font-normal">(Saving...)</span>
                                                    )}
                                                </p>
                                                {(!category.icon || !category.description) ? (
                                                    <p className="text-sm text-muted mt-0.5 animate-pulse">
                                                        {t("Settings.categories.generating")}
                                                    </p>
                                                ) : category.description && (
                                                    <p className="text-sm text-muted mt-0.5">
                                                        {category.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditModal(category)}
                                                disabled={category.id.startsWith("temp-")}
                                            >
                                                <Pencil className="w-4 h-4 text-muted hover:text-primary" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(category)}
                                                disabled={category.id.startsWith("temp-")}
                                            >
                                                <Trash2 className="w-4 h-4 text-muted hover:text-danger" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-12 text-center flex flex-col items-center gap-4 text-muted">
                                <div className="w-16 h-16 rounded-full bg-surface2 flex items-center justify-center text-2xl">
                                    📭
                                </div>
                                <p>暂无分类，点击右上角新建</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex gap-3 p-4 bg-info/10 rounded-lg text-sm text-info items-start">
                    <Info className="w-5 h-5 shrink-0" />
                    <p>
                        <strong>提示：</strong>
                        分类描述用于帮助 AI 更准确地识别和归类消费。例如，「餐饮」分类的描述可以是「外卖、堂食、食材采购」。
                    </p>
                </div>
            </main>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingCategory ? "编辑分类" : "新建分类"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">
                                分类名称 <span className="text-danger">*</span>
                            </label>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="例如：餐饮"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSave();
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">图标</label>
                            <Input
                                value={formData.icon}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, icon: e.target.value }))
                                }
                                placeholder="例如：🍽️"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">
                                描述（帮助 AI 识别）
                            </label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                                placeholder="例如：外卖、堂食、食材采购"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>
                            取消
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={
                                !formData.name.trim() ||
                                isPending
                            }
                        >
                            {isPending
                                ? "保存中..."
                                : "保存"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title="确认删除"
                description={`确定要删除分类「${deleteConfirm.name}」吗？相关记录将变为未分类。`}
                onConfirm={handleConfirmDelete}
                variant="destructive"
                confirmLabel="删除"
            />
        </div>
    );
}
