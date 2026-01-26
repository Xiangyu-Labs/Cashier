"use client";

import { useState, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
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
import { Transaction, InputMessage } from "@/types/api";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Camera, Send } from "lucide-react";

export default function LedgerPage() {
  const params = useParams();
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
    queryFn: () => fetchTransactions(ledgerId, { status: "confirmed", limit: 100 }),
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

  // Group confirmed transactions
  const confirmedGroups = useMemo(() => {
    if (!confirmedTxs) return { batches: [], others: [] };

    const batches: Record<string, { inputMessage: InputMessage; transactions: Transaction[] }> = {};
    const others: Transaction[] = [];

    confirmedTxs.forEach((tx) => {
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
  }, [confirmedTxs]);

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
      queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (transactionId: string) =>
      deleteTransaction(ledgerId, transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
      queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
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
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">账本不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* 顶部导航 */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/ledgers">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">{ledger.name}</h1>
          </div>
          <Link href={`/ledger/${ledgerId}/categories`}>
            <Button variant="ghost" className="text-primary hover:text-primary/80">
              管理分类
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* 输入区域 */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              placeholder="输入消费记录，例如：午饭35元... (支持粘贴图片)"
              className="resize-none"
              rows={3}
            />

            {/* 已选择的图片预览 */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img.data}
                      alt={`上传图片 ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-md border border-border"
                    />
                    <button
                      onClick={() =>
                        setImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" /> 图片
              </Button>
              <div className="flex-1" />
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending || (!text && images.length === 0)}
              >
                {sendMutation.isPending ? "处理中..." : (
                  <>
                    <Send className="h-4 w-4 mr-2" /> 发送
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 待确认记录 */}
        {(pendingGroups.batches.length > 0 || pendingGroups.others.length > 0) && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                待确认
              </h2>
              <Button
                variant="default"
                onClick={() => confirmAllMutation.mutate()}
                disabled={confirmAllMutation.isPending}
                size="sm"
              >
                {confirmAllMutation.isPending ? "确认中..." : "全部确认"}
              </Button>
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
              <Card>
                <div className="bg-surface2 p-3 border-b border-border">
                  <h3 className="font-medium text-text">其他记录</h3>
                </div>
                <CardContent className="p-4 space-y-3">
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
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* 已确认记录 - 使用 BatchView */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-text">已确认记录</h2>

          {/* 汇总 */}
          {summary && summary.totals.length > 0 && (
            <Card className="bg-surface2/50 border-none shadow-none">
              <CardContent className="p-4 flex items-center gap-4">
                <span className="text-sm font-medium text-muted">本月支出</span>
                <div className="flex gap-4">
                  {summary.totals.map((t, idx) => (
                    <p key={idx} className="text-xl font-bold text-text">
                      {t.currency || "未知"} {t.total.toFixed(2)}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confirmed Batches */}
          {confirmedGroups.batches.length > 0 ? (
            <div className="space-y-4">
              {confirmedGroups.batches.map((batch) => (
                <BatchTransactionCard
                  key={batch.inputMessage.id}
                  inputMessage={batch.inputMessage}
                  transactions={batch.transactions}
                  categories={categories || []}
                  isConfirmed={true}
                  onUpdateTransaction={(id, data) =>
                    updateMutation.mutate({ transactionId: id, data })
                  }
                  onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                />
              ))}
            </div>
          ) : null}

          {/* Confirmed Others */}
          {confirmedGroups.others.length > 0 && (
            <Card>
              <div className="bg-surface2 p-3 border-b border-border">
                <h3 className="font-medium text-text">其他历史记录</h3>
              </div>
              <CardContent className="p-4 space-y-2">
                {confirmedGroups.others.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => {
                      setSelectedTransaction(tx);
                      setIsDetailModalOpen(true);
                    }}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-surface2 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-xl">
                        {tx.category?.icon || "📝"}
                      </div>
                      <div>
                        <p className="font-medium text-text">{tx.itemName}</p>
                        <p className="text-xs text-muted">
                          {tx.category?.name || "未分类"}
                          {tx.transactionDate && (
                            <span className="ml-2">
                              · {new Date(tx.transactionDate).toLocaleDateString("zh-CN")}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-text">
                      {tx.currency || ""} {parseFloat(tx.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {confirmedGroups.batches.length === 0 && confirmedGroups.others.length === 0 && (
            <p className="text-muted text-center py-8">暂无已确认记录</p>
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
