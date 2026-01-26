"use client";

import { InputMessage } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionInput } from "./TransactionInput";
import { TransactionQueueStatus } from "./TransactionQueueStatus";

interface RecordTabProps {
    ledgerId: string;
    queuedMessages: InputMessage[] | undefined;
}

export function RecordTab({ ledgerId, queuedMessages }: RecordTabProps) {
    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6">
                    <TransactionInput ledgerId={ledgerId} />
                </CardContent>
            </Card>

            {queuedMessages && queuedMessages.length > 0 && (
                <Card className="bg-surface2/30 border-dashed border-primary/50">
                    <CardContent className="p-4 space-y-3">
                        <h3 className="text-sm font-medium text-primary flex items-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                            正在处理 ({queuedMessages.length})
                        </h3>
                        <TransactionQueueStatus queuedMessages={queuedMessages} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
