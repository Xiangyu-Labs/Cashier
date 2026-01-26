"use client";

import { InputMessage } from "@/types/api";

interface TransactionQueueStatusProps {
    queuedMessages: InputMessage[];
}

export function TransactionQueueStatus({ queuedMessages }: TransactionQueueStatusProps) {
    if (!queuedMessages || queuedMessages.length === 0) return null;

    return (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {queuedMessages.map((msg) => (
                <div key={msg.id} className="flex items-center gap-3 text-sm text-text/80 bg-surface/50 p-2 rounded">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface border border-border shrink-0">
                        {msg.status === "queued" ? "排队中" : "处理中"}
                    </span>
                    <span className="truncate flex-1">
                        {msg.contentType === "text" ? msg.content : "[图片]"}
                    </span>
                </div>
            ))}
        </div>
    );
}
