
import { InputMessage, Transaction, Category } from "@/types/api";
import { TransactionCard } from "./TransactionCard";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";

interface BatchTransactionCardProps {
  inputMessage: InputMessage;
  transactions: Transaction[];
  categories: Category[];
  isConfirmed?: boolean;
  onConfirm?: (ids: string[]) => Promise<void>;
  onUpdateTransaction: (
    transactionId: string,
    data: {
      categoryId?: string | null;
      itemName?: string;
      amount?: number;
      currency?: string | null;
    }
  ) => void;
  onDeleteTransaction: (transactionId: string) => void;
}

export function BatchTransactionCard({
  inputMessage,
  transactions,
  categories,
  isConfirmed = false,
  onConfirm,
  onUpdateTransaction,
  onDeleteTransaction,
}: BatchTransactionCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  // Track expanded categories. Default to open for pending? No, user asked for breakdown.
  // "Click beverage, see all items". So default closed.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Group transactions by Category ID + Currency
  const groupedTransactions = useMemo(() => {
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

    transactions.forEach((tx) => {
      const catId = tx.categoryId || "unclassified";
      const currency = tx.currency || "unknown";
      const key = `${catId}-${currency}`;

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

      groups[key].total += parseFloat(tx.amount);
      groups[key].items.push(tx);
    });

    return Object.values(groups).sort((a, b) => {
      // Sort unclassified to top if pending? Or bottom?
      if (a.categoryId === null) return -1;
      if (b.categoryId === null) return 1;
      return b.total - a.total; // Descending by amount
    });
  }, [transactions]);

  // Overall summary for the header
  const summaryText = useMemo(() => {
    const totals: Record<string, number> = {};
    groupedTransactions.forEach((g) => {
      const curr = g.currency || "?";
      totals[curr] = (totals[curr] || 0) + g.total;
    });
    return Object.entries(totals)
      .map(([curr, total]) => `${curr} ${total.toFixed(2)}`)
      .join(", ");
  }, [groupedTransactions]);

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
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-4 transition-all hover:shadow-md">
      {/* Header */}
      <div className="bg-gray-50/50 p-4 border-b border-gray-100 flex gap-4 items-start">
        {inputMessage.contentType === "image" ? (
          <div className="flex-shrink-0 relative group">
            <img
              src={inputMessage.content}
              alt="Input"
              className="w-16 h-16 object-cover rounded border border-gray-200"
            />
          </div>
        ) : (
          <div className="flex-shrink-0 w-16 h-16 bg-blue-50 text-blue-500 rounded flex items-center justify-center border border-blue-100">
            <span className="text-2xl">📝</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h3 className="font-medium text-gray-900 truncate pr-4">
              {inputMessage.contentType === "text"
                ? inputMessage.content
                : "图片识别结果"}
            </h3>
            <span className="text-xs text-muted whitespace-nowrap">
              {new Date(inputMessage.createdAt).toLocaleString("zh-CN")}
            </span>
          </div>

          <div className="mt-1 text-sm text-gray-500">
            {inputMessage.contentType === "text" && (
              <p className="line-clamp-1 mb-1">{inputMessage.content}</p>
            )}
            <p className="font-medium text-primary">
              汇总: {summaryText || "无金额"}
            </p>
          </div>
        </div>
      </div>

      {/* Grouped Categories List */}
      <div className="divide-y divide-gray-100">
        {groupedTransactions.map((group) => {
          const isExpanded = expandedKeys.has(group.key);
          const hasIssues = group.items.some(
            (tx) => !tx.categoryId || !tx.currency
          );

          return (
            <div key={group.key} className="bg-white">
              {/* Category Summary Row */}
              <div
                onClick={() => toggleExpand(group.key)}
                className={`w-full flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? "bg-gray-50/80" : ""
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
                <div className="p-3 pl-16 pr-4 space-y-3 bg-gray-50/30 border-t border-gray-100/50 inner-shadow">
                  {group.items.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      categories={categories}
                      onUpdate={(data) => onUpdateTransaction(tx.id, data)}
                      onDelete={() => onDeleteTransaction(tx.id)}
                      hideCategory={true}
                    />
                  ))}
                  {/* Show AI Response for the whole batch if user wants context, or per item. 
                      Displaying it here might be repetitive if strictly per-item logic is used.
                      Let's stick to per-item description for now as added in TransactionCard.
                  */}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      {!isConfirmed && onConfirm && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            {isConfirming ? "确认中..." : "确认整单"}
          </Button>
        </div>
      )}

      {/* Confirmed Footer - Maybe link to detail? */}
      {isConfirmed && (
        <div className="p-2 bg-gray-50 border-t border-gray-100 flex justify-end">
          {/* Optional: Add 'Review again' or similar if needed */}
        </div>
      )}
    </div>
  );
}
