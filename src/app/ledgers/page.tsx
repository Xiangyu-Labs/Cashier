"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLedgers, createLedger, deleteLedger, updateLedger } from "@/lib/api";
import { Ledger } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Book } from "lucide-react";
import { LedgerItem } from "@/components/ledger/LedgerItem";

export default function LedgersPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState("");

  // Edit state
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [editLedgerName, setEditLedgerName] = useState("");

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
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      updateLedger(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
      setEditingLedger(null);
      setEditLedgerName("");
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
      });
    }
  };

  const handleUpdate = () => {
    if (editingLedger && editLedgerName.trim()) {
      updateMutation.mutate({
        id: editingLedger.id,
        data: { name: editLedgerName.trim() },
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[var(--text)]">我的账本</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建账本
          </Button>
        </div>

        {ledgers && ledgers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="flex flex-col items-center pt-6">
              <Book className="h-12 w-12 text-[var(--muted)] mb-4 opacity-50" />
              <p className="text-[var(--muted)] mb-4">还没有账本，创建一个开始记账吧！</p>
              <Button onClick={() => setShowCreateModal(true)}>
                创建第一个账本
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ledgers?.map((ledger) => (
              <LedgerItem
                key={ledger.id}
                ledger={ledger}
                onEdit={(l) => {
                  setEditingLedger(l);
                  setEditLedgerName(l.name);
                }}
                onDelete={handleDelete}
              />
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
              <label className="text-sm font-medium text-[var(--text)]">
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

      <Dialog open={!!editingLedger} onOpenChange={(open) => !open && setEditingLedger(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑账本</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text)]">
                账本名称
              </label>
              <Input
                value={editLedgerName}
                onChange={(e) => setEditLedgerName(e.target.value)}
                placeholder="例如：日常开销"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editLedgerName.trim()) {
                    handleUpdate();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setEditingLedger(null)}
            >
              取消
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!editLedgerName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
