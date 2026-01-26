
import { InputMessage, Transaction, Category } from "@/types/api";
import { TransactionCard } from "./TransactionCard";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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

  // Parse content based on type
  const { text, images } = useMemo(() => {
    const content = inputMessage.content;
    const type = inputMessage.contentType;

    let textContent: string | null = null;
    let imagesContent: string[] = [];

    try {
      const trimmed = content.trim();
      let isParsed = false;

      // Try parsing JSON if it looks like one, regardless of stated type (since mixed is stored as text)
      if ((trimmed.startsWith("{") || trimmed.startsWith("["))) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            // Likely array of image data strings
            imagesContent = parsed;
            isParsed = true;
          } else if (typeof parsed === "object" && parsed !== null) {
            // Likely mixed content object
            if (parsed.text || parsed.images) {
              if (parsed.text) textContent = parsed.text;
              if (parsed.images) {
                imagesContent = parsed.images.map((img: { data?: string } | string) => (typeof img === "object" && img.data ? img.data : img as string));
              }
              isParsed = true;
            }
          }
        } catch (e) {
          // Ignore JSON parse error, treat as raw string
        }
      }

      if (!isParsed) {
        if (type === "image") {
          // Single image
          imagesContent = [content];
        } else {
          // Text (or failed JSON parse)
          textContent = content;
        }
      }
    } catch (e) {
      console.error("Failed to parse message content:", e);
      // Fallback
      if (type === "image") imagesContent = [content];
      else textContent = content;
    }

    return { text: textContent, images: imagesContent };
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-6">
      {/* 1. Date Header */}
      <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
        <span className="text-sm font-medium text-muted">
          {new Date(inputMessage.createdAt).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {/* Optional: Add status badge or similar here if needed */}
      </div>

      {/* 2. User Content Section */}
      <div className="p-4 space-y-3">
        {/* Images Grid */}
        {images.length > 0 && (
          <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-lg overflow-hidden border border-border bg-gray-50 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setSelectedImage(img)}
              >
                <img
                  src={img}
                  alt={`User upload ${idx + 1}`}
                  className="w-full h-full object-cover"
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

      {/* 3. Transaction Details (Category Groups) */}
      <div className="border-t border-gray-100 divide-y divide-gray-50">
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
                <div className="p-3 space-y-3 bg-gray-50/30 border-t border-gray-100/50 inner-shadow">
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
            className="bg-primary hover:bg-primary/90 text-white shadow-sm"
          >
            {isConfirming ? "确认中..." : "确认整单"}
          </Button>
        </div>
      )}

      {/* Image Zoom Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center">
          <DialogTitle className="sr-only">Image Zoom</DialogTitle>
          <DialogDescription className="sr-only">Zoomed view of the transaction image</DialogDescription>
          {selectedImage && (
            <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
              <img
                src={selectedImage}
                alt="Zoomed"
                className="max-w-full max-h-[90vh] object-contain pointer-events-auto"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
