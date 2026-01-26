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
                    <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${msg.status === "failed"
                            ? "bg-danger/10 text-danger border-danger/20"
                            : "bg-surface border-border"
                            }`}
                    >
                        {msg.status === "queued" ? "排队中" : msg.status === "processing" ? "处理中" : "失败"}
                    </span>
                    <span className="truncate flex-1">
                        {(() => {
                            if (msg.contentType === "image") return "[图片]";
                            if (msg.contentType === "text") {
                                if (msg.content.startsWith("{")) {
                                    try {
                                        const parsed = JSON.parse(msg.content);
                                        return parsed.text || "[图片]";
                                    } catch {
                                        return msg.content;
                                    }
                                }
                                return msg.content;
                            }
                            return "[消息]";
                        })()}
                    </span>
                    {msg.status === "failed" && (
                        <span className="text-xs text-danger" title="处理失败">
                            (失败)
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
