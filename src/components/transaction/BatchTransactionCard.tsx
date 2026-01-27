import { InputMessage, Transaction, Category } from "@/types/api";
import { TransactionCard } from "./TransactionCard";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import { ImageViewer } from "@/components/ui/image-viewer";
import Image from "next/image";

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:")) {
    return data;
  }
  // Assume jpeg if not specified, or we could try to guess/default
  return `data:image/jpeg;base64,${data}`;
}


interface BatchTransactionCardProps {
  inputMessage: InputMessage;
  transactions: Transaction[];
  categories: Category[];
  isConfirmed?: boolean;
  onConfirm?: (ids: string[]) => Promise<void>;
  onUpdateTransaction?: (
    transactionId: string,
    data: {
      categoryId?: string | null;
      itemName?: string;
      amount?: number;
      currency?: string | null;
    }
  ) => void;
  onDeleteTransaction?: (transactionId: string) => void;
  onDelete?: () => void;
  status: "queued" | "processing" | "completed" | "failed";
}

export function BatchTransactionCard({
  inputMessage,
  transactions,
  categories,
  isConfirmed = false,
  onConfirm,
  onUpdateTransaction,
  onDeleteTransaction,
  onDelete,
  status,
}: BatchTransactionCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  // Default to collapsed as requested
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  // Track expanded categories. Default to open for pending? No, user asked for breakdown.
  // "Click beverage, see all items". So default closed.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Group transactions by Category ID + Currency
  const { groupedTransactions, totalAmounts } = useMemo(() => {
    const groups: Record<
      string,
      {
        key: string;
        categoryId: string | null;
        categoryName: string;
        categoryIcon: string;
        currency: string;
        total: number;
        items: Transaction[];
      }
    > = {};

    const totals: Record<string, number> = {};

    transactions.forEach((tx) => {
      const catId = tx.categoryId || "unclassified";
      const currency = tx.currency || "unknown";
      const key = `${catId}-${currency}`;
      const amount = parseFloat(tx.amount);

      if (!groups[key]) {
        groups[key] = {
          key,
          categoryId: tx.categoryId,
          categoryName: tx.category?.name || "未分类",
          categoryIcon: tx.category?.icon || "📝",
          currency: tx.currency || "",
          total: 0,
          items: [],
        };
      }

      groups[key].total += amount;
      groups[key].items.push(tx);

      if (tx.currency) {
        totals[tx.currency] = (totals[tx.currency] || 0) + amount;
      }
    });

    const sortedGroups = Object.values(groups).sort((a, b) => {
      // Sort unclassified to top if pending? Or bottom?
      if (a.categoryId === null) return -1;
      if (b.categoryId === null) return 1;
      return b.total - a.total; // Descending by amount
    });

    return { groupedTransactions: sortedGroups, totalAmounts: totals };
  }, [transactions]);

  // Parse content based on type
  const { text, images } = useMemo(() => {
    return {
      text: inputMessage.text,
      images: inputMessage.imageUrls || []
    };
  }, [inputMessage]);


  const toggleExpand = (key: string) => {
    const newSet = new Set(expandedKeys);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedKeys(newSet);
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setIsConfirming(true);
    try {
      await onConfirm(transactions.map((t) => t.id));
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden mb-6">
      {/* 1. Date Header */}
      <div className="px-4 py-3 bg-surface2/50 border-b border-border flex justify-between items-center">
        <span className="text-sm font-medium text-muted">
          {new Date(inputMessage.createdAt).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-3">
          {/* Status Indicator - only show if no transactions parsed yet */}
          {transactions.length === 0 && <TransactionStatus status={status} />}

          {/* Total Amount (always show if available) */}
          {Object.entries(totalAmounts).map(([currency, total]) => (
            <span key={currency} className="text-sm font-bold text-text">
              <span className="text-xs text-muted mr-1">{currency}</span>
              {total.toFixed(2)}
            </span>
          ))}

          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsContentExpanded(!isContentExpanded)}
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title={isContentExpanded ? "收起原始内容" : "查看原始内容"}
          >
            {isContentExpanded ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 2. User Content Section */}
      {isContentExpanded && (
        <div className="p-4 space-y-3 bg-surface2/30 border-b border-border animate-in slide-in-from-top-2 duration-200">
          {/* Images Grid */}
          {images.length > 0 && (
            <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImageIndex(idx)}
                >
                  <Image
                    src={getSafeImageSrc(img)}
                    alt={`User upload ${idx + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* User Text */}
          {text && (
            <div className="text-text bg-surface2/30 p-3 rounded-md text-sm whitespace-pre-wrap leading-relaxed">
              {text}
            </div>
          )}
        </div>
      )}


      {/* 3. Transaction Details (Category Groups) */}
      <div className="border-t border-border divide-y divide-border">
        {groupedTransactions.map((group) => {
          const isExpanded = expandedKeys.has(group.key);
          const hasIssues = group.items.some(
            (tx) => !tx.categoryId || !tx.currency
          );

          return (
            <div key={group.key} className="bg-surface">
              {/* Category Summary Row */}
              <div
                onClick={() => toggleExpand(group.key)}
                className={`w-full flex items-center justify-between p-4 cursor-pointer hover:bg-surface2 transition-colors ${isExpanded ? "bg-surface2/80" : ""
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-lg border border-border/50">
                    <CategoryIcon iconName={group.categoryIcon} className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-text">{group.categoryName}</p>
                    <p className="text-xs text-muted">
                      {group.items.length} 笔记录
                      {hasIssues && !isConfirmed && (
                        <span className="ml-2 text-warning">Wait for edit</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-text">
                    <span className="text-xs text-muted mr-1">
                      {group.currency || ""}
                    </span>
                    {group.total.toFixed(2)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  )}
                </div>
              </div>

              {/* Expanded Transactions */}
              {isExpanded && (
                <div className="p-3 space-y-3 bg-surface2/30 border-t border-border/50 inner-shadow">
                  {group.items.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      categories={categories}
                      onUpdate={(data) => onUpdateTransaction?.(tx.id, data)}
                      onDelete={() => onDeleteTransaction?.(tx.id)}
                      hideCategory={true}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      {
        !isConfirmed && onConfirm && (
          <div className="p-4 bg-surface2 border-t border-border flex justify-end">
            <Button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              {isConfirming ? "确认中..." : "确认账单"}
            </Button>
          </div>
        )
      }

      {/* ImageViewer Component */}
      <ImageViewer
        images={images}
        initialIndex={typeof selectedImageIndex === 'number' ? selectedImageIndex : 0}
        open={selectedImageIndex !== null}
        onOpenChange={(open) => !open && setSelectedImageIndex(null)}
      />
    </div >
  );
}
