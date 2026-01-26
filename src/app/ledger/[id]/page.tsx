"use client";

import { useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchLedger,
  fetchTransactions,
  fetchTransactionSummary,
  sendMessage,
  updateTransaction,
  deleteTransaction,
  confirmTransactions,
  fetchCategories,
} from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import Link from "next/link";

export default function LedgerPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ledgerId = params.id as string;

  const [text, setText] = useState("");
  const [images, setImages] = useState<{ data: string; mimeType: string }[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["ledger", ledgerId],
    queryFn: () => fetchLedger(ledgerId),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", ledgerId],
    queryFn: () => fetchCategories(ledgerId),
  });

  const { data: pendingTxs } = useQuery({
    queryKey: ["transactions", ledgerId, "pending"],
    queryFn: () => fetchTransactions(ledgerId, { status: "pending" }),
  });

  const { data: confirmedTxs } = useQuery({
    queryKey: ["transactions", ledgerId, "confirmed"],
    queryFn: () => fetchTransactions(ledgerId, { status: "confirmed", limit: 20 }),
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", ledgerId],
    queryFn: () => fetchTransactionSummary(ledgerId, "confirmed"),
  });

  // Group pending transactions
  const pendingGroups = useMemo(() => {
    if (!pendingTxs) return { batches: [], others: [] };

    const batches: Record<string, { inputMessage: InputMessage; transactions: Transaction[] }> = {};
    const others: Transaction[] = [];

    pendingTxs.forEach((tx) => {
      if (tx.inputMessage && tx.inputMessageId) {
        if (!batches[tx.inputMessageId]) {
          batches[tx.inputMessageId] = {
            inputMessage: tx.inputMessage,
            transactions: [],
          };
        }
        batches[tx.inputMessageId].transactions.push(tx);
      } else {
        others.push(tx);
      }
    });

    return {
      batches: Object.values(batches).sort((a, b) =>
        new Date(b.inputMessage.createdAt).getTime() - new Date(a.inputMessage.createdAt).getTime()
      ),
      others,
    };
  }, [pendingTxs]);

  const sendMutation = useMutation({
    mutationFn: (data: Parameters<typeof sendMessage>[1]) =>
      sendMessage(ledgerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
      setText("");
      setImages([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      transactionId,
      data,
    }: {
      transactionId: string;
      data: Parameters<typeof updateTransaction>[2];
    }) => updateTransaction(ledgerId, transactionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (transactionId: string) =>
      deleteTransaction(ledgerId, transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
    },
  });

  const confirmAllMutation = useMutation({
    mutationFn: () => confirmTransactions(ledgerId, { confirmAll: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
      queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
    },
  });

  const confirmBatchMutation = useMutation({
    mutationFn: (transactionIds: string[]) =>
      confirmTransactions(ledgerId, { transactionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
      queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
    },
  });

  const handleSend = () => {
    if (!text && images.length === 0) return;
    sendMutation.mutate({
      text: text || undefined,
      images: images.length > 0 ? images : undefined,
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    processFiles(Array.from(files));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      processFiles(files);
    }
  };

  const processFiles = (files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImages((prev) => [
          ...prev,
          { data: base64, mimeType: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  if (ledgerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">账本不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/ledgers" className="text-gray-500 hover:text-gray-700">
              ←
            </Link>
            <h1 className="text-xl font-bold">{ledger.name}</h1>
          </div>
          <Link
            href={`/ledger/${ledgerId}/categories`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            管理分类
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* 输入区域 */}
        <section className="bg-white rounded-lg shadow p-4">
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              placeholder="输入消费记录，例如：午饭35元... (支持粘贴图片)"
              className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />

            {/* 已选择的图片预览 */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={img.data}
                      alt={`上传图片 ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded"
                    />
                    <button
                      onClick={() =>
                        setImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                multiple
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                📷 图片
              </button>
              <div className="flex-1" />
              <button
                onClick={handleSend}
                disabled={
                  sendMutation.isPending ||
                  (!text && images.length === 0)
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sendMutation.isPending ? "处理中..." : "发送"}
              </button>
            </div>
          </div>
        </section>

        {/* 待确认记录 */}
        {(pendingGroups.batches.length > 0 || pendingGroups.others.length > 0) && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                待确认
              </h2>
              <button
                onClick={() => confirmAllMutation.mutate()}
                disabled={confirmAllMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {confirmAllMutation.isPending ? "确认中..." : "全部确认"}
              </button>
            </div>

            {/* Batched Transactions */}
            <div className="space-y-4">
              {pendingGroups.batches.map((batch) => (
                <BatchTransactionCard
                  key={batch.inputMessage.id}
                  inputMessage={batch.inputMessage}
                  transactions={batch.transactions}
                  categories={categories || []}
                  onConfirm={async (ids) => {
                    await confirmBatchMutation.mutateAsync(ids);
                  }}
                  onUpdateTransaction={(id, data) => 
                    updateMutation.mutate({ transactionId: id, data })
                  }
                  onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                />
              ))}
            </div>

            {/* Other Transactions */}
            {pendingGroups.others.length > 0 && (
               <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 p-3 border-b border-gray-100">
                  <h3 className="font-medium text-gray-700">其他记录</h3>
                </div>
                <div className="p-4 space-y-3">
                  {pendingGroups.others.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      categories={categories || []}
                      onUpdate={(data) =>
                        updateMutation.mutate({ transactionId: tx.id, data })
                      }
                      onDelete={() => deleteMutation.mutate(tx.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 已确认记录 */}
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">已确认记录</h2>

          {/* 汇总 */}
          {summary && summary.totals.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">总支出</p>
              <div className="flex flex-wrap gap-4">
                {summary.totals.map((t, idx) => (
                  <p key={idx} className="text-xl font-bold">
                    {t.currency || "未知"} {t.total.toFixed(2)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {confirmedTxs && confirmedTxs.length > 0 ? (
            <div className="space-y-2">
              {confirmedTxs.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => {
                    setSelectedTransaction(tx);
                    setIsDetailModalOpen(true);
                  }}
                  className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2"
                >
                  <div className="flex items-center gap-3">
                    <span>{tx.category?.icon || "📝"}</span>
                    <div>
                      <p className="font-medium">{tx.itemName}</p>
                      <p className="text-xs text-gray-500">
                        {tx.category?.name || "未分类"}
                        {tx.transactionDate && (
                          <span className="ml-2">
                            · {new Date(tx.transactionDate).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    {tx.currency || ""} {parseFloat(tx.amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">暂无记录</p>
          )}
        </section>
      </main>

      {/* 交易详情弹窗 */}
      <TransactionDetailModal
        transaction={selectedTransaction}
        categories={categories || []}
        open={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTransaction(null);
        }}
        onUpdate={(data) => {
          if (selectedTransaction) {
            updateMutation.mutate({
              transactionId: selectedTransaction.id,
              data,
            });
          }
        }}
        onDelete={() => {
          if (selectedTransaction) {
            deleteMutation.mutate(selectedTransaction.id);
          }
        }}
      />
    </div>
  );
}
