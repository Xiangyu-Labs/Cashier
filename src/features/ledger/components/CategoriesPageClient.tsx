"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { ArrowLeft, Plus, Pencil, Trash2, Info, Loader2 } from "lucide-react";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
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

interface CategoriesPageClientProps {
    ledgerId: string;
    categories: EntryCategory[];
}

interface CreateCategoryData {
    name: string;
    description?: string;
    icon?: string;
}

import { useTranslations } from "next-intl";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";

export function CategoriesPageClient({ ledgerId, categories: initialCategories }: CategoriesPageClientProps): React.ReactElement {
    const router = useRouter();
    const t = useTranslations();

    // Smart polling for AI updates
    const { data: categories } = useSmartPolling<EntryCategory[]>({
        queryKey: ["ledger-categories", ledgerId],
        queryFn: () => getEntryCategoriesAction(ledgerId),
        isActive: (data) => data?.some((c) => !c.icon && !c.description) ?? false,
        interval: 3000,
        initialData: initialCategories
    });


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

    const [isPending, startTransition] = useTransition();

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

        startTransition(async () => {
            if (editingCategory) {
                const result = await updateEntryCategoryAction(ledgerId, editingCategory.id, data);
                if (result.success) {
                    toast.success("Updated successfully");
                    handleClose();
                } else {
                    toast.error("Update failed");
                }
            } else {
                const result = await createEntryCategoryAction(ledgerId, data);
                if (result.success) {
                    toast.success("Created successfully");
                    handleClose();
                } else {
                    toast.error("Creation failed");
                }
            }
        });
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
            startTransition(async () => {
                const result = await deleteEntryCategoryAction(ledgerId, deleteConfirm.id!);
                if (result.success) {
                    toast.success("Deleted successfully");
                    setDeleteConfirm({ ...deleteConfirm, open: false });
                } else {
                    toast.error("Deletion failed");
                }
            });
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
                        新建分类
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
                                                {(!category.icon && !category.description) ? (
                                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                                ) : (
                                                    category.icon || "📁"
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium">{category.name}</p>
                                                {(!category.icon && !category.description) ? (
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
                                            >
                                                <Pencil className="w-4 h-4 text-muted hover:text-primary" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(category)}
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
