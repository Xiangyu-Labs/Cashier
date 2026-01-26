import { useState } from "react";
import { Transaction, Category } from "@/types/api";

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
    <div
      className={`p-3 rounded-lg border ${
        needsAttention ? "border-yellow-300 bg-yellow-50" : "border-gray-200"
      }`}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editData.itemName}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, itemName: e.target.value }))
            }
            className="w-full p-2 border rounded"
            placeholder="商品名称"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={editData.amount}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  amount: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-24 p-2 border rounded"
              placeholder="金额"
            />
            <input
              type="text"
              value={editData.currency}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, currency: e.target.value }))
              }
              className="w-20 p-2 border rounded"
              placeholder="货币"
            />
            <select
              value={editData.categoryId}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, categoryId: e.target.value }))
              }
              className="flex-1 p-2 border rounded"
            >
              <option value="">选择分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-sm text-gray-600"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {transaction.category?.icon || "📝"}
            </span>
            <div>
              <p className="font-medium">{transaction.itemName}</p>
              <p className="text-xs text-gray-500">
                {transaction.category?.name || (
                  <span className="text-yellow-600">需要选择分类</span>
                )}
                {!transaction.currency && (
                  <span className="text-yellow-600 ml-2">需要选择货币</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-semibold">
              {transaction.currency || "?"}{" "}
              {parseFloat(transaction.amount).toFixed(2)}
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="text-blue-600 text-sm"
            >
              编辑
            </button>
            <button
              onClick={onDelete}
              className="text-red-500 text-sm"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
