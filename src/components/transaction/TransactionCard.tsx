import { useState } from "react";
import { Transaction, Category } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Check, X } from "lucide-react";

interface TransactionCardProps {
  transaction: Transaction;
  categories: Category[];
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
  }) => void;
  onDelete: () => void;
}

export function TransactionCard({
  transaction,
  categories,
  onUpdate,
  onDelete,
}: TransactionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    itemName: transaction.itemName,
    amount: parseFloat(transaction.amount),
    currency: transaction.currency || "",
    categoryId: transaction.categoryId || "",
  });

  const handleSave = () => {
    onUpdate({
      itemName: editData.itemName,
      amount: editData.amount,
      currency: editData.currency || null,
      categoryId: editData.categoryId || null,
    });
    setIsEditing(false);
  };

  const needsAttention = !transaction.categoryId || !transaction.currency;

  return (
    <Card
      className={`transition-all ${needsAttention ? "border-warning/50 bg-warning/5" : "hover:border-primary/50"
        }`}
    >
      <CardContent className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                type="text"
                value={editData.itemName}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, itemName: e.target.value }))
                }
                placeholder="商品名称"
              />
              <select
                value={editData.categoryId}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, categoryId: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">选择分类</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Input
                type="number"
                value={editData.amount}
                onChange={(e) =>
                  setEditData((prev) => ({
                    ...prev,
                    amount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-32"
                placeholder="金额"
              />
              <Input
                type="text"
                value={editData.currency}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, currency: e.target.value }))
                }
                className="w-24"
                placeholder="货币"
              />
              <div className="flex-1 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  <X className="h-4 w-4 mr-1" />
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                >
                  <Check className="h-4 w-4 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-surface2 rounded-full text-xl">
                  {transaction.category?.icon || "📝"}
                </div>
                <div>
                  <p className="font-medium text-text">{transaction.itemName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {transaction.category ? (
                      <span className="text-xs text-muted">{transaction.category.name}</span>
                    ) : (
                      <Badge variant="warning" className="text-[10px] px-1 h-5">需分类</Badge>
                    )}

                    {!transaction.currency && (
                      <Badge variant="warning" className="text-[10px] px-1 h-5">需货币</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <p className="font-mono font-semibold text-text">
                  <span className="text-xs text-muted mr-1">{transaction.currency || "?"}</span>
                  {parseFloat(transaction.amount).toFixed(2)}
                </p>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsEditing(true)}
                    className="text-muted hover:text-primary"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onDelete}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            {transaction.description && (
              <p className="text-xs text-muted bg-surface2 p-2 rounded">
                {transaction.description}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card >
  );
}
