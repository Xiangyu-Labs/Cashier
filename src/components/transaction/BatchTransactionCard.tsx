import { InputMessage, Transaction, Category } from "@/types/api";
import { TransactionCard } from "./TransactionCard";
import { useState } from "react";

interface BatchTransactionCardProps {
  inputMessage: InputMessage;
  transactions: Transaction[];
  categories: Category[];
  onConfirm: (ids: string[]) => void; // Using void as per usage, though Promise<void> is compatible
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
  onConfirm,
  onUpdateTransaction,
  onDeleteTransaction,
}: BatchTransactionCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  // Calculate summary
  const summary = transactions.reduce((acc, tx) => {
    const categoryName = tx.category?.name || "未分类";
    const amount = parseFloat(tx.amount);
    const currency = tx.currency || ""; // Assuming same currency for simplicity or grouping strings

    // Simple grouping key: Currency + Category
    const key = `${categoryName}-${currency}`;
    if (!acc[key]) {
      acc[key] = { amount: 0, currency, categoryName };
    }
    acc[key].amount += amount;
    return acc;
  }, {} as Record<string, { amount: number; currency: string; categoryName: string }>);

  const summaryText = Object.values(summary)
    .map(({ categoryName, amount, currency }) => `${categoryName}: ${currency}${amount.toFixed(2)}`)
    .join(", ");

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(transactions.map((t) => t.id));
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-4">
      {/* Header */}
      <div className="bg-gray-50 p-4 border-b border-gray-100 flex gap-4 items-start">
        {inputMessage.contentType === "image" ? (
          <div className="flex-shrink-0">
             {/* Assuming content is base64 or url. If it's a long base64, we might want to truncate or handle efficiently. 
                 But for now assuming standard img src compatible string. */}
            <img 
              src={inputMessage.content} 
              alt="Input" 
              className="w-16 h-16 object-cover rounded border border-gray-200"
            />
          </div>
        ) : (
          <div className="flex-shrink-0 w-16 h-16 bg-blue-100 text-blue-500 rounded flex items-center justify-center">
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
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {new Date(inputMessage.createdAt).toLocaleString("zh-CN")}
            </span>
          </div>
          {inputMessage.contentType === "text" && (
            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
              {inputMessage.content}
            </p>
          )}
           <p className="text-sm font-medium text-gray-700 mt-2">
            汇总: {summaryText}
          </p>
        </div>
      </div>

      {/* Transactions List */}
      <div className="p-4 space-y-3 bg-white">
        {transactions.map((tx) => (
          <TransactionCard
            key={tx.id}
            transaction={tx}
            categories={categories}
            onUpdate={(data) => onUpdateTransaction(tx.id, data)}
            onDelete={() => onDeleteTransaction(tx.id)}
          />
        ))}
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
        >
          {isConfirming ? "确认中..." : "确认整单"}
        </button>
      </div>
    </div>
  );
}
