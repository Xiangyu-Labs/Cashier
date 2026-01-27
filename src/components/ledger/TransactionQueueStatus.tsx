"use client";

import { Receipt } from "@/types/api";

import { TransactionStatus } from "@/components/ui/TransactionStatus";

interface TransactionQueueStatusProps {
    queuedReceipts: Receipt[];
}

export function TransactionQueueStatus({ queuedReceipts }: TransactionQueueStatusProps) {
    if (!queuedReceipts || queuedReceipts.length === 0) return null;

    return (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {queuedReceipts.map((receipt) => (
                <div key={receipt.id} className="flex items-center gap-3 text-sm text-text/80 bg-surface/50 p-2 rounded">
                    <TransactionStatus status={receipt.status || "queued"} className="shrink-0" />
                    <span className="truncate flex-1">
                        {(() => {
                            if (receipt.text) return receipt.text;
                            if (receipt.imageUrls && receipt.imageUrls.length > 0) return "[图片]";
                            return "[消息]";
                        })()}
                    </span>
                    {receipt.status === "failed" && (
                        <span className="text-xs text-danger" title="处理失败">
                            (失败)
                        </span>
                    )}
                    {receipt.status === "invalid" && (
                        <span className="text-xs text-danger" title="无效账单">
                            (无效)
                        </span>
                    )}
                    {receipt.status === "to_confirm" && (
                        <span className="text-xs text-warning" title="待确认">
                            (待确认)
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
