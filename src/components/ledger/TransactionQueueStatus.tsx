"use client";

import { InputMessage } from "@/types/api";

import { TransactionStatus } from "@/components/ui/TransactionStatus";

interface TransactionQueueStatusProps {
    queuedMessages: InputMessage[];
}

export function TransactionQueueStatus({ queuedMessages }: TransactionQueueStatusProps) {
    if (!queuedMessages || queuedMessages.length === 0) return null;

    return (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {queuedMessages.map((msg) => (
                <div key={msg.id} className="flex items-center gap-3 text-sm text-text/80 bg-surface/50 p-2 rounded">
                    <TransactionStatus status={msg.status || "queued"} className="shrink-0" />
                    <span className="truncate flex-1">
                        {(() => {
                            if (msg.text) return msg.text;
                            if (msg.imageUrls && msg.imageUrls.length > 0) return "[图片]";
                            return "[消息]";
                        })()}
                    </span>
                    {msg.status === "failed" && (
                        <span className="text-xs text-danger" title="处理失败">
                            (失败)
                        </span>
                    )}
                    {msg.status === "to_confirm" && (
                        <span className="text-xs text-warning" title="待确认">
                            (待确认)
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
