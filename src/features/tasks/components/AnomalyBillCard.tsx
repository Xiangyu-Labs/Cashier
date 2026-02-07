"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { SerializedAnomalyBill } from "../server/actions/task-queue";
import { SourceDocumentPreview } from "./SourceDocumentPreview";

interface AnomalyBillCardProps {
    bill: SerializedAnomalyBill;
    ledgerId: string;
    onRetry: () => void;
    onDelete: () => void;
}

export function AnomalyBillCard({
    bill,
    ledgerId,
    onRetry,
    onDelete,
}: AnomalyBillCardProps) {
    const t = useTranslations("TaskQueue");
    const tCommon = useTranslations("Common");
    const tEntries = useTranslations("LedgerEntriesTab");

    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-amber-50/50 rounded-lg border border-amber-100 overflow-hidden">
            {/* Header - clickable to expand */}
            <div
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-amber-50/80 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <ChevronDown
                    className={cn(
                        "h-3.5 w-3.5 text-amber-500 mt-1 shrink-0 transition-transform",
                        isExpanded && "rotate-180"
                    )}
                />
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                        {bill.title || t("untitledBill")}
                    </p>
                    {bill.anomalyReason && !isExpanded && (
                        <p className="text-xs text-amber-600 mt-0.5 line-clamp-2">
                            {bill.anomalyReason}
                        </p>
                    )}
                </div>
                <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={onRetry}
                    >
                        {tEntries("retry")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                        onClick={onDelete}
                    >
                        {tCommon("delete")}
                    </Button>
                </div>
            </div>

            {/* Expandable Content */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-amber-100/50">
                            {/* Anomaly Reason */}
                            {bill.anomalyReason && (
                                <div className="flex items-start gap-2">
                                    <span className="text-xs font-medium text-amber-600 shrink-0">
                                        {t("reason")}:
                                    </span>
                                    <span className="text-xs text-amber-600">
                                        {bill.anomalyReason}
                                    </span>
                                </div>
                            )}

                            {/* Original Input Preview */}
                            <div className="pt-2 border-t border-amber-100/30">
                                <div className="flex items-start gap-2 mb-1.5">
                                    <span className="text-xs font-medium text-muted-foreground shrink-0">
                                        {t("originalInput")}:
                                    </span>
                                </div>
                                <SourceDocumentPreview
                                    ledgerId={ledgerId}
                                    sourceDocumentId={bill.id}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
