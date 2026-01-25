"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchLedgers, createLedger, deleteLedger } from "@/lib/api";
import { Ledger } from "@/types/api";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">我的账本</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            新建账本
          </button>
        </div>

        {ledgers && ledgers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-4">还没有账本，创建一个开始记账吧！</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              创建第一个账本
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ledgers?.map((ledger) => (
              <div
                key={ledger.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition cursor-pointer"
                onClick={() => router.push(`/ledger/${ledger.id}`)}
              >
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-semibold">{ledger.name}</h2>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ledger);
                    }}
                    className="text-gray-400 hover:text-red-500 transition"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  语言: {ledger.language}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  创建于 {new Date(ledger.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建账本弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">新建账本</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账本名称
                </label>
                <input
                  type="text"
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  placeholder="例如：日常开销"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  偏好语言
                </label>
                <select
                  value={newLedgerLanguage}
                  onChange={(e) => setNewLedgerLanguage(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewLedgerName("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newLedgerName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {createMutation.isPending ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
