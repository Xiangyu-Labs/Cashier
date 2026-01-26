"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchLedgers, createLedger, deleteLedger } from "@/lib/api";
import { Ledger } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Book } from "lucide-react";

export default function LedgersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState("");
  const [newLedgerLanguage, setNewLedgerLanguage] = useState("zh-CN");

  const { data: ledgers, isLoading } = useQuery({
    queryKey: ["ledgers"],
    queryFn: fetchLedgers,
  });

  const createMutation = useMutation({
    mutationFn: createLedger,
    onSuccess: (newLedger) => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
      setShowCreateModal(false);
      setNewLedgerName("");
      router.push(`/ledger/${newLedger.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLedger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });

  const handleCreate = () => {
    if (newLedgerName.trim()) {
      createMutation.mutate({
        name: newLedgerName.trim(),
        language: newLedgerLanguage,
      });
    }
  };

  const handleDelete = (ledger: Ledger) => {
    if (confirm(`确定要删除账本「${ledger.name}」吗？此操作不可恢复。`)) {
      deleteMutation.mutate(ledger.id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-text">我的账本</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建账本
          </Button>
        </div>

        {ledgers && ledgers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="flex flex-col items-center pt-6">
              <Book className="h-12 w-12 text-muted mb-4 opacity-50" />
              <p className="text-muted mb-4">还没有账本，创建一个开始记账吧！</p>
              <Button onClick={() => setShowCreateModal(true)}>
                创建第一个账本
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ledgers?.map((ledger) => (
              <Card
                key={ledger.id}
                className="hover:border-primary transition-colors cursor-pointer group relative"
                onClick={() => router.push(`/ledger/${ledger.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{ledger.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity -mr-2 -mt-2 text-muted hover:text-danger hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ledger);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-muted">
                      语言: {ledger.language === 'zh-CN' ? '简体中文' :
                             ledger.language === 'zh-TW' ? '繁體中文' :
                             ledger.language === 'en' ? 'English' :
                             ledger.language === 'ja' ? '日本語' : ledger.language}
                    </p>
                    <p className="text-xs text-muted/80">
                      创建于 {new Date(ledger.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建账本</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">
                账本名称
              </label>
              <Input
                value={newLedgerName}
                onChange={(e) => setNewLedgerName(e.target.value)}
                placeholder="例如：日常开销"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLedgerName.trim()) {
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">
                偏好语言
              </label>
              <select
                value={newLedgerLanguage}
                onChange={(e) => setNewLedgerLanguage(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewLedgerName("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newLedgerName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
