"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Transaction, Category } from "@/types/api";

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
    transactionDate?: string | null;
  }) => void;
  onDelete: () => void;
}

export function TransactionDetailModal({
  transaction,
  categories,
  open,
  onClose,
  onUpdate,
  onDelete,
}: TransactionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    itemName: "",
    amount: 0,
    currency: "",
    categoryId: "",
    transactionDate: "",
  });

  // Reset edit state when transaction changes
  const handleOpen = () => {
    if (transaction) {
      setEditData({
        itemName: transaction.itemName,
        amount: parseFloat(transaction.amount),
        currency: transaction.currency || "",
        categoryId: transaction.categoryId || "",
        transactionDate: transaction.transactionDate || "",
      });
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    onUpdate({
      itemName: editData.itemName,
      amount: editData.amount,
      currency: editData.currency || null,
      categoryId: editData.categoryId || null,
      transactionDate: editData.transactionDate || null,
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm("确定要删除这条记录吗？")) {
      onDelete();
      onClose();
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  if (!transaction) return null;

  // Format dates for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "未知";
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  // Render original input content based on type
  const renderOriginalContent = () => {
    const msg = transaction.inputMessage;
    if (!msg) return <p className="text-gray-400 text-sm">无原始记录</p>;

    switch (msg.contentType) {
      case "text":
        return (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {msg.content}
          </p>
        );
      case "image": {
        // Check if content is JSON array (multiple images) or single data URL
        let images: string[];
        try {
          const parsed = JSON.parse(msg.content);
          images = Array.isArray(parsed) ? parsed : [msg.content];
        } catch {
          // Not JSON, treat as single image data URL
          images = [msg.content];
        }
        return (
          <div className="flex flex-wrap gap-2">
            {images.map((imgSrc, idx) => (
              <img
                key={idx}
                src={imgSrc}
                alt={`原始图片 ${idx + 1}`}
                className="max-w-full max-h-48 rounded object-contain"
              />
            ))}
          </div>
        );
      }
      case "audio":
        return (
          <audio controls className="w-full">
            <source src={msg.content} type="audio/webm" />
            您的浏览器不支持音频播放
          </audio>
        );
      default:
        return <p className="text-gray-400 text-sm">未知类型</p>;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} title="交易详情">
      <div className="p-4 space-y-4" onAnimationEnd={handleOpen}>
        {isEditing ? (
          // Edit mode
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名称
              </label>
              <input
                type="text"
                value={editData.itemName}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, itemName: e.target.value }))
                }
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  金额
                </label>
                <input
                  type="number"
                  value={editData.amount}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      amount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  货币
                </label>
                <input
                  type="text"
                  value={editData.currency}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, currency: e.target.value }))
                  }
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="CNY / USD"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={editData.categoryId}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, categoryId: e.target.value }))
                }
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">选择分类</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                交易日期
              </label>
              <input
                type="date"
                value={editData.transactionDate}
                onChange={(e) =>
                  setEditData((prev) => ({
                    ...prev,
                    transactionDate: e.target.value,
                  }))
                }
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          // View mode
          <>
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">
                {transaction.category?.icon || "📝"}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{transaction.itemName}</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {transaction.currency || "?"}{" "}
                  {parseFloat(transaction.amount).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">分类</span>
                <span>{transaction.category?.name || "未分类"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">交易日期</span>
                <span>{formatDate(transaction.transactionDate)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">状态</span>
                <span
                  className={
                    transaction.status === "confirmed"
                      ? "text-green-600"
                      : "text-yellow-600"
                  }
                >
                  {transaction.status === "confirmed" ? "已确认" : "待确认"}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">创建时间</span>
                <span>{formatDateTime(transaction.createdAt)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">来源类型</span>
                <span>
                  {transaction.sourceType === "text"
                    ? "文本"
                    : transaction.sourceType === "image"
                    ? "图片"
                    : transaction.sourceType === "audio"
                    ? "语音"
                    : "混合"}
                </span>
              </div>
            </div>

            {/* Original Input */}
            <div className="pt-2">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                原始输入
              </h4>
              <div className="p-3 bg-gray-50 rounded-lg">
                {renderOriginalContent()}
              </div>
            </div>

            {/* AI Response */}
            {transaction.inputMessage?.aiResponse && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  AI 解析结果
                </h4>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                    {transaction.inputMessage.aiResponse}
                  </pre>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800"
              >
                删除
              </button>
              <button
                onClick={() => {
                  setEditData({
                    itemName: transaction.itemName,
                    amount: parseFloat(transaction.amount),
                    currency: transaction.currency || "",
                    categoryId: transaction.categoryId || "",
                    transactionDate: transaction.transactionDate || "",
                  });
                  setIsEditing(true);
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                编辑
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
