"use client";

import { useState } from "react";
import { Trash2, Copy, Plus, Key } from "lucide-react";
import { ApiKey } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

interface ApiKeySectionProps {
    apiKeys: ApiKey[];
    onCreateApiKey: (name: string) => Promise<ApiKey>;
    onDeleteApiKey: (id: string) => void;
}

export function ApiKeySection({ apiKeys, onCreateApiKey, onDeleteApiKey }: ApiKeySectionProps) {
    const [newKeyName, setNewKeyName] = useState("");
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
    const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);

    const handleCreate = async () => {
        if (!newKeyName.trim()) return;
        try {
            const newKey = await onCreateApiKey(newKeyName.trim());
            setCreatedKey(newKey);
            setNewKeyName("");
            setIsCreateDialogOpen(false);
        } catch (error) {
            console.error("Failed to create key", error);
            toast.error("创建密钥失败");
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("密钥已复制到剪贴板");
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-medium">API Keys</h2>
                    <p className="text-sm text-[var(--muted)]">
                        管理用于外部集成的 API 密钥
                    </p>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="gap-2">
                    <Plus size={16} />
                    新建密钥
                </Button>
            </div>

            <div className="space-y-3">
                {apiKeys.length === 0 ? (
                    <div className="text-center py-8 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-[var(--radius)]">
                        暂无 API 密钥
                    </div>
                ) : (
                    apiKeys.map((apiKey) => (
                        <div
                            key={apiKey.id}
                            className="flex items-center justify-between p-4 bg-[var(--surface2)] rounded-[var(--radius)] border border-[var(--border)]"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-[var(--surface)] rounded-full">
                                    <Key size={16} className="text-[var(--primary)]" />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{apiKey.name}</div>
                                    <div className="text-xs text-[var(--muted)] font-mono truncate">
                                        {/* Display masked key directly from prop, no copy button for list items */}
                                        {apiKey.key || "******"}
                                    </div>
                                    <div className="text-[10px] text-[var(--muted)] mt-1">
                                        创建于 {new Date(apiKey.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setKeyToDelete(apiKey.id)}
                                className="text-[var(--muted)] hover:text-[var(--danger)] shrink-0"
                            >
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>新建 API 密钥</DialogTitle>
                        <DialogDescription>
                            创建一个新的 API 密钥用于外部系统访问此账本。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="密钥名称 (例如: 自动记账脚本)"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleCreate} disabled={!newKeyName.trim()}>
                            创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success Dialog with Full Key */}
            <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>API 密钥创建成功</DialogTitle>
                        <DialogDescription>
                            这是您唯一一次查看完整密钥的机会。请立即复制并妥善保存。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="p-4 bg-[var(--surface)] rounded border font-mono text-sm break-all relative group">
                            {createdKey?.key}
                            <Button
                                size="sm"
                                variant="outline"
                                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyToClipboard(createdKey?.key || "")}
                            >
                                <Copy size={14} className="mr-1" /> 复制
                            </Button>
                        </div>
                        <Button
                            className="w-full gap-2"
                            onClick={() => copyToClipboard(createdKey?.key || "")}
                        >
                            <Copy size={16} />
                            复制密钥
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setCreatedKey(null)}>
                            我已保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>删除 API 密钥</DialogTitle>
                        <DialogDescription>
                            确定要删除这个密钥吗？删除后使用此密钥的外部应用将无法访问。此操作无法撤销。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setKeyToDelete(null)}>
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (keyToDelete) {
                                    onDeleteApiKey(keyToDelete);
                                    setKeyToDelete(null);
                                }
                            }}
                        >
                            删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
