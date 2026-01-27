import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Transaction } from "@/types/api";
import { Calendar, Edit2, Tag, Trash2 } from "lucide-react";
import { TransactionOriginalContent } from "./TransactionOriginalContent";

interface TransactionViewDetailsProps {
    transaction: Transaction;
    onEdit: () => void;
    onDelete: () => void;
}

export function TransactionViewDetails({
    transaction,
    onEdit,
    onDelete,
}: TransactionViewDetailsProps) {
    // Format dates for display
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "未知";
        return new Date(dateStr).toLocaleDateString("zh-CN");
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString("zh-CN");
    };

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-surface2 flex items-center justify-center text-3xl shadow-sm border border-border">
                    {transaction.category?.icon || "📝"}
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-semibold text-text">
                        {transaction.itemName}
                    </h3>
                    <p className="text-3xl font-bold text-primary mt-1">
                        <span className="text-lg font-normal text-muted mr-1">
                            {transaction.currency || "?"}
                        </span>
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
                    <span className="text-sm text-text">
                        {formatDate(transaction.transactionDate)}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">状态</span>
                    <Badge
                        variant={transaction.status === "confirmed" ? "success" : "warning"}
                    >
                        {transaction.status === "confirmed" ? "已确认" : "待确认"}
                    </Badge>
                </div>

                {transaction.metadata?.quantity && (
                    <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-1">
                        <span className="text-sm text-muted">数量</span>
                        <span className="text-sm text-text">
                            {transaction.metadata.quantity}
                        </span>
                    </div>
                )}
                {transaction.metadata?.unitPrice && (
                    <div className="flex justify-between items-center border-t border-border/50 pt-2">
                        <span className="text-sm text-muted">单价</span>
                        <span className="text-sm text-text">
                            {transaction.metadata.unitPrice}
                        </span>
                    </div>
                )}
                {transaction.metadata?.originalName && (
                    <div className="flex justify-between items-center border-t border-border/50 pt-2">
                        <span className="text-sm text-muted">原始名称</span>
                        <span className="text-sm text-text">
                            {transaction.metadata.originalName}
                        </span>
                    </div>
                )}
                <div className="flex justify-between items-center border-t border-border/50 pt-2">
                    <span className="text-sm text-muted">创建时间</span>
                    <span className="text-sm text-text">
                        {formatDateTime(transaction.createdAt)}
                    </span>
                </div>
            </div>

            {/* Original Input */}
            <div>
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    原始输入
                </h4>
                <div className="p-4 bg-surface2 rounded-lg border border-border">
                    {transaction.inputMessage ? (
                        <TransactionOriginalContent
                            text={transaction.inputMessage.text}
                            images={transaction.inputMessage.imageUrls}
                        />
                    ) : (
                        <p className="text-muted text-sm italic">无原始记录</p>
                    )}
                </div>
            </div>

            {/* Actions */}
            <DialogFooter>
                <Button
                    variant="destructive"
                    onClick={onDelete}
                    className="mr-auto"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除
                </Button>
                <Button onClick={onEdit}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    编辑
                </Button>
            </DialogFooter>
        </div>
    );
}
