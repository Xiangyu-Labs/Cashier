"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, UseMutationResult } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import { Plus, Trash2, Check, X, Pencil, GripVertical, ArrowLeft } from "lucide-react";
import {
    fetchLedger,
    updateLedger,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    fetchApiKeys,
    createApiKey,
    deleteApiKey,
    ApiKey,
} from "@/lib/api";
import { Copy } from "lucide-react";

import { CategoryIcon } from "@/components/CategoryIcon";
import { Category } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";



export default function LedgerSettingsPage() {
    const params = useParams();
    const ledgerId = params.id as string;
    const router = useRouter();
    const queryClient = useQueryClient();
    // Categories Query
    const { data: categories, isLoading: isCategoriesLoading } = useQuery({
        queryKey: ["categories", ledgerId],
        queryFn: () => fetchCategories(ledgerId),
    });

    const [newCurrency, setNewCurrency] = useState("");
    const [isEditingCategory, setIsEditingCategory] = useState<string | null>(null);
    const [editingCategoryData, setEditingCategoryData] = useState<{ name: string, description: string }>({ name: "", description: "" });
    const [newCategoryName, setNewCategoryName] = useState("");
    const [localCategories, setLocalCategories] = useState<Category[]>([]);

    // Update local state when query data changes
    // We need to use useEffect or sync during render more carefully to avoid loops,
    // but doing it during render is okay if we are careful.
    if (categories && localCategories.length === 0 && categories.length > 0) {
        setLocalCategories(categories);
    }
    // Also update if the length changes or if we force a refresh (e.g. after add/delete)
    // Detailed check to avoid infinite re-renders if order is different locally
    if (categories && localCategories.length !== categories.length) {
        setLocalCategories(categories);
    } else if (categories && localCategories.length > 0) {
        // Just in case IDs don't match (e.g. deletion from another client)
        const currentIds = localCategories.map(c => c.id).sort().join(',');
        const newIds = categories.map(c => c.id).sort().join(',');
        if (currentIds !== newIds) {
            setLocalCategories(categories);
        }
    }

    // Ledger Query
    const { data: ledger, isLoading: isLedgerLoading } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => fetchLedger(ledgerId),
    });

    // Mutations
    const updateLedgerMutation = useMutation({
        mutationFn: (data: { language?: string; currencies?: string[]; autoConfirm?: boolean }) =>
            updateLedger(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: (data: { name: string }) => createCategory(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
            setNewCategoryName("");
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
            setIsEditingCategory(null);
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: string) => deleteCategory(ledgerId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
        },
    });

    const handleReorder = (newOrder: Category[]) => {
        setLocalCategories(newOrder);
    };

    const handleDragEnd = () => {
        const categoryIds = localCategories.map(c => c.id);
        reorderCategories(ledgerId, categoryIds).then(() => {
            queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
        });
    };



    const handleAddCurrency = () => {
        if (!newCurrency || !ledger) return;
        const current = ledger.currencies || [];
        if (!current.includes(newCurrency.toUpperCase())) {
            updateLedgerMutation.mutate({ currencies: [...current, newCurrency.toUpperCase()] });
        }
        setNewCurrency("");
    };

    const handleRemoveCurrency = (currency: string) => {
        if (!ledger) return;
        const current = ledger.currencies || [];
        updateLedgerMutation.mutate({ currencies: current.filter(c => c !== currency) });
    };

    const handleCreateCategory = () => {
        if (!newCategoryName.trim()) return;
        createCategoryMutation.mutate({ name: newCategoryName.trim() });
    };

    if (isLedgerLoading || isCategoriesLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
        );
    }

    if (!ledger) {
        return <div className="p-8">Ledger not found</div>;
    }

    return (
        <div className="min-h-screen bg-bg text-text">
            <header className="bg-surface border-b border-border sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 h-14 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-lg font-bold">{ledger.name} 设置</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-6 space-y-8">
                {/* Language Settings */}

                {/* Automation Settings */}
                <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                    <h2 className="text-lg font-medium mb-6">自动化</h2>

                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="font-medium">免确认模式</div>
                            <div className="text-sm text-[var(--muted)]">AI 识别的交易将直接入账，跳过确认步骤</div>
                        </div>
                        <Switch
                            checked={ledger.autoConfirm || false}
                            onCheckedChange={(checked) => updateLedgerMutation.mutate({ autoConfirm: checked })}
                            className="data-[state=unchecked]:bg-zinc-200 dark:data-[state=unchecked]:bg-zinc-700"
                        />

                    </div>

                    {ledger.autoConfirm && (
                        <div className="mt-4 flex items-start gap-2 bg-warning/10 text-warning p-3 rounded-[var(--radius)] text-sm">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <span>开启此功能后，AI 可能会犯错导致并在您的账本中创建错误记录，建议您定期进行二次检查。</span>
                        </div>
                    )}
                </section>

                {/* API Keys Settings */}
                <ApiKeySection ledgerId={ledgerId} />

                {/* Data Configuration */}
                <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
                    <h2 className="text-lg font-medium mb-6">数据配置</h2>

                    <div className="space-y-8">
                        {/* Currency Settings */}
                        <div>
                            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">货币</h3>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {ledger.currencies?.map(currency => (
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
                        </div>

                        <div className="h-px bg-[var(--border)]" />

                        {/* Category Settings */}
                        <div>
                            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">分类</h3>

                        </div>

                        <div className="space-y-2 mb-4">
                            {localCategories.length > 0 ? (
                                <Reorder.Group axis="y" values={localCategories} onReorder={handleReorder}>
                                    {localCategories.map(category => (
                                        <SortableCategoryItem
                                            key={category.id}
                                            category={category}
                                            isEditingCategory={isEditingCategory}
                                            editingCategoryData={editingCategoryData}
                                            setEditingCategoryData={setEditingCategoryData}
                                            setIsEditingCategory={setIsEditingCategory}
                                            updateCategoryMutation={updateCategoryMutation}
                                            deleteCategoryMutation={deleteCategoryMutation}
                                            handleDragEnd={handleDragEnd}
                                        />
                                    ))}
                                </Reorder.Group>
                            ) : (
                                <div className="text-center py-4 text-[var(--muted)] text-sm">暂无分类</div>
                            )}
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
                    </div>
                </section>
            </main>
        </div>
    );
}

function ApiKeySection({ ledgerId }: { ledgerId: string }) {
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);

    const { data: apiKeys, isLoading } = useQuery({
        queryKey: ["apiKeys", ledgerId],
        queryFn: () => fetchApiKeys(ledgerId),
    });

    const createMutation = useMutation({
        mutationFn: (name: string) => createApiKey(ledgerId, name),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["apiKeys", ledgerId] });
            setCreatedKey(data);
            setNewKeyName("");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (keyId: string) => deleteApiKey(ledgerId, keyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["apiKeys", ledgerId] });
        },
    });

    const handleCreate = () => {
        if (!newKeyName.trim()) return;
        createMutation.mutate(newKeyName.trim());
    };

    return (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
            <h2 className="text-lg font-medium mb-6">API Keys</h2>
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--primary)]"></div>
                    </div>
                ) : (
                    apiKeys?.map((key) => (
                        <div key={key.id} className="flex items-center justify-between p-3 bg-[var(--surface2)] rounded-[var(--radius)]">
                            <div>
                                <div className="font-medium text-sm">{key.name}</div>
                                <div className="text-xs text-[var(--muted)]">
                                    创建于: {new Date(key.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(key.id)}
                                className="text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                            >
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))
                )}

                {apiKeys?.length === 0 && !isLoading && (
                    <div className="text-center text-sm text-[var(--muted)] py-4">
                        暂无 API Key
                    </div>
                )}

                <div className="pt-2">
                    {!isCreateOpen ? (
                        <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="w-full">
                            <Plus size={16} className="mr-2" />
                            创建新密钥
                        </Button>
                    ) : (
                        <div className="space-y-3 bg-[var(--surface2)] p-4 rounded-[var(--radius)]">
                            {!createdKey ? (
                                <>
                                    <h4 className="font-medium text-sm">新密钥名称</h4>
                                    <input
                                        type="text"
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                        className="w-full p-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                        placeholder="例如: 我的快捷指令"
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>取消</Button>
                                        <Button size="sm" onClick={handleCreate} disabled={!newKeyName.trim() || createMutation.isPending}>
                                            {createMutation.isPending ? "创建中..." : "创建"}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-green-500 font-medium text-sm">
                                        <Check size={16} /> 密钥已创建!
                                    </div>
                                    <p className="text-xs text-[var(--muted)]">
                                        请立即复制此 Key，它将不再显示
                                    </p>
                                    <div className="flex items-center gap-2 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] font-mono text-sm break-all">
                                        <span className="flex-1">{createdKey.key}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => navigator.clipboard.writeText(createdKey.key || "")}
                                            title="Copy"
                                        >
                                            <Copy size={16} />
                                        </Button>
                                    </div>
                                    <Button className="w-full" onClick={() => { setCreatedKey(null); setIsCreateOpen(false); }}>
                                        完成
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function SortableCategoryItem({
    category,
    isEditingCategory,
    editingCategoryData,
    setEditingCategoryData,
    setIsEditingCategory,
    updateCategoryMutation,
    deleteCategoryMutation,
    handleDragEnd,
}: {
    category: Category;
    isEditingCategory: string | null;
    editingCategoryData: { name: string; description: string };
    setEditingCategoryData: (data: { name: string; description: string }) => void;
    setIsEditingCategory: (id: string | null) => void;
    updateCategoryMutation: UseMutationResult<Category, Error, { id: string; data: Partial<Category> }, unknown>;
    deleteCategoryMutation: UseMutationResult<void, Error, string, unknown>;
    handleDragEnd: () => void;
}) {
    const dragControls = useDragControls();

    return (
        <Reorder.Item
            value={category}
            dragListener={false}
            dragControls={dragControls}
            onDragEnd={handleDragEnd}
            className="flex items-center gap-3 p-3 bg-[var(--surface2)] rounded-[var(--radius)] group mb-2 relative"
        >
            <div
                className="cursor-move p-1 -ml-1 touch-none"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <GripVertical className="text-[var(--muted)]" size={16} />
            </div>

            {isEditingCategory === category.id ? (
                <div className="flex-1 flex gap-2">
                    <input
                        type="text"
                        value={editingCategoryData.name}
                        onChange={e => setEditingCategoryData({ ...editingCategoryData, name: e.target.value })}
                        className="flex-1 px-2 py-1 text-sm rounded bg-surface text-text"
                    />
                    <input
                        type="text"
                        value={editingCategoryData.description || ""}
                        onChange={e => setEditingCategoryData({ ...editingCategoryData, description: e.target.value })}
                        placeholder="描述"
                        className="flex-1 px-2 py-1 text-sm rounded bg-surface text-[var(--muted)]"
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
                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                            className="p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </>
            )}
        </Reorder.Item>
    );
}
