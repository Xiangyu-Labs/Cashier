import { Receipt, Transaction, Category } from "@/types/api";
import { TransactionCard } from "./TransactionCard";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Trash2, Eye, EyeOff, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import { ImageViewer } from "@/components/ui/image-viewer";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:")) {
    return data;
  }
  // Assume jpeg if not specified, or we could try to guess/default
  return `data:image/jpeg;base64,${data}`;
}


interface BatchTransactionCardProps {
  receipt: Receipt;
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
  defaultExpanded?: boolean;
  onRetry?: () => Promise<void>;
  status: "queued" | "processing" | "to_confirm" | "completed" | "failed" | "invalid" | "pending";
  className?: string;
}

export function BatchTransactionCard({
  receipt,
  transactions,
  categories,
  isConfirmed = false,
  onConfirm,
  onUpdateTransaction,
  onDeleteTransaction,
  onDelete,
  defaultExpanded = false,
  onRetry,
  status,
  className,
}: BatchTransactionCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  // Initialize from defaultExpanded prop
  const [isContentExpanded, setIsContentExpanded] = useState(defaultExpanded);
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
      text: receipt.text,
      images: receipt.imageUrls || []
    };
  }, [receipt]);


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
    <div className={cn("bg-surface rounded-xl shadow-sm border border-border overflow-hidden mb-6", className)}>
      {/* 1. Date Header */}
      <div className="px-4 py-3 bg-surface2/50 border-b border-border flex justify-between items-center">
        <span className="text-sm font-medium text-muted">
          {new Date(receipt.createdAt).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {receipt.title && (
            <span className="ml-3 font-medium text-text">{receipt.title}</span>
          )}
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

          {/* Retry Action in Header (for failed/invalid items) */}
          {(status === "failed" || status === "invalid") && onRetry && (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); async function runRetry() { if (onRetry) { setIsRetrying(true); try { await onRetry(); } finally { setIsRetrying(false); } } } runRetry(); }}
                disabled={isRetrying}
                className="h-7 px-2 text-xs border-red-600/30 hover:bg-red-600/10 hover:text-red-700 text-red-600 dark:text-red-400 dark:border-red-400/30 dark:hover:text-red-300"
                title="重试"
              >
                {isRetrying ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                )}
                重试
              </Button>
            </>
          )}

          {/* Confirm Action in Header (for pending items) */}
          {!isConfirmed && onConfirm && (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                disabled={isConfirming}
                className="h-7 px-2 text-xs border-amber-600/30 hover:bg-amber-600/10 hover:text-amber-700 text-amber-600 dark:text-amber-400 dark:border-amber-400/30 dark:hover:text-amber-300"
                title="确认账单"
              >
                {isConfirming ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                确认
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. User Content Section */}
      <AnimatePresence>
        {isContentExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-surface2/30 border-b border-border"
          >
            <div className="p-4 space-y-3">
              {/* Images Grid */}
              {images.length > 0 && (
                <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
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
          </motion.div>
        )}
      </AnimatePresence>


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
                  <motion.div
                    animate={{ rotate: isExpanded ? 0 : -90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </motion.div>
                </div>
              </div>

              {/* Expanded Transactions */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      {/* Footer Actions - Only show if NO Header actions are used (e.g. for some other future state). 
          Currently Confirm and Retry are both in Header. 
          We hide footer if onConfirm OR onRetry is present for these statuses.
      */}
      {
        (!isConfirmed &&
          !(onConfirm) &&
          !(onRetry && (status === "failed" || status === "invalid")) &&
          (onRetry || onConfirm) // Fallback check
        ) && (
          <div className="p-4 bg-surface2 border-t border-border flex justify-end gap-2">
            {/* Legacy footer logic if ever needed */}
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
