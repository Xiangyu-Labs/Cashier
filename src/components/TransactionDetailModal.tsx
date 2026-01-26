"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Transaction, Category } from "@/types/api";
import { Calendar, Tag, FileText, Image as ImageIcon, Mic, Trash2, Edit2 } from "lucide-react";

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
    if (!msg) return <p className="text-muted text-sm italic">无原始记录</p>;

    switch (msg.contentType) {
      case "text":
        return (
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-muted mt-1 shrink-0" />
            <p className="text-sm text-text whitespace-pre-wrap">
              {msg.content}
            </p>
          </div>
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
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <ImageIcon className="h-4 w-4" />
              <span>图片记录</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {images.map((imgSrc, idx) => (
                <img
                  key={idx}
                  src={imgSrc}
                  alt={`原始图片 ${idx + 1}`}
                  className="max-w-full max-h-48 rounded-lg border border-border object-contain"
                />
              ))}
            </div>
          </div>
        );
      }
      case "audio":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Mic className="h-4 w-4" />
              <span>语音记录</span>
            </div>
            <audio controls className="w-full">
              <source src={msg.content} type="audio/webm" />
              您的浏览器不支持音频播放
            </audio>
          </div>
        );
      default:
        return <p className="text-muted text-sm">未知类型</p>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent onAnimationEnd={handleOpen} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>交易详情</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {isEditing ? (
            // Edit mode
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">
                  商品名称
                </label>
                <Input
                  type="text"
                  value={editData.itemName}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, itemName: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">
                    金额
                  </label>
                  <Input
                    type="number"
                    value={editData.amount}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        amount: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">
                    货币
                  </label>
                  <Input
                    type="text"
                    value={editData.currency}
                    onChange={(e) =>
                      setEditData((prev) => ({ ...prev, currency: e.target.value }))
                    }
                    placeholder="CNY / USD"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">
                  分类
                </label>
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

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">
                  交易日期
                </label>
                <Input
                  type="date"
                  value={editData.transactionDate}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      transactionDate: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsEditing(false)}
                >
                  取消
                </Button>
                <Button onClick={handleSave}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            // View mode
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-surface2 flex items-center justify-center text-3xl shadow-sm border border-border">
                  {transaction.category?.icon || "📝"}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-text">{transaction.itemName}</h3>
                  <p className="text-3xl font-bold text-primary mt-1">
                    <span className="text-lg font-normal text-muted mr-1">{transaction.currency || "?"}</span>
                    {parseFloat(transaction.amount).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface2/30 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted flex items-center gap-2">
                    <Tag className="h-4 w-4" /> 分类
                  </span>
                  {transaction.category ? (
                    <Badge variant="default" className="font-normal">
                      {transaction.category.name}
                    </Badge>
                  ) : (
                    <Badge variant="warning">未分类</Badge>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> 交易日期
                  </span>
                  <span className="text-sm text-text">{formatDate(transaction.transactionDate)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">状态</span>
                  <Badge variant={transaction.status === "confirmed" ? "success" : "warning"}>
                    {transaction.status === "confirmed" ? "已确认" : "待确认"}
                  </Badge>
                </div>

                {transaction.metadata?.quantity && (
                  <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-1">
                    <span className="text-sm text-muted">数量</span>
                    <span className="text-sm text-text">{transaction.metadata.quantity}</span>
                  </div>
                )}
                {transaction.metadata?.unitPrice && (
                  <div className="flex justify-between items-center border-t border-border/50 pt-2">
                    <span className="text-sm text-muted">单价</span>
                    <span className="text-sm text-text">{transaction.metadata.unitPrice}</span>
                  </div>
                )}
                {transaction.metadata?.originalName && (
                  <div className="flex justify-between items-center border-t border-border/50 pt-2">
                    <span className="text-sm text-muted">原始名称</span>
                    <span className="text-sm text-text">{transaction.metadata.originalName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-border/50 pt-2">
                  <span className="text-sm text-muted">创建时间</span>
                  <span className="text-sm text-text">{formatDateTime(transaction.createdAt)}</span>
                </div>
              </div>

              {/* Original Input */}
              <div>
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  原始输入
                </h4>
                <div className="p-4 bg-surface2 rounded-lg border border-border">
                  {renderOriginalContent()}
                </div>
              </div>

              {/* Actions */}
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  className="mr-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除
                </Button>
                <Button
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
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  编辑
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
