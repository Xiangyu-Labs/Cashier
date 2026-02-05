import { memo, useState } from "react";
import { SourceDocument, SourceDocumentLight } from "@/types/api";
import { ProcessingStatus } from "@/components/ui/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, MoreVertical, ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { ImageViewer } from "@/components/ui/image-viewer";

function getSafeImageSrc(data: string): string {
    if (data.startsWith("http") || data.startsWith("data:")) {
        return data;
    }
    return `data:image/jpeg;base64,${data}`;
}

interface PendingBillCardProps {
    sourceDocument: SourceDocument | SourceDocumentLight;
    status: "processing" | "anomaly";
    anomalyReason?: string;
    onRetry?: () => void | Promise<void>;
    onDelete?: () => void;
    className?: string;
}

export const PendingBillCard = memo(function PendingBillCard({
    sourceDocument,
    status,
    anomalyReason,
    onRetry,
    onDelete,
    className,
}: PendingBillCardProps) {
    const t = useTranslations("PendingBills");
    const tCommon = useTranslations("Common");
    const locale = useLocale();

    const [isRetrying, setIsRetrying] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

    // Get images from sourceDocument
    const images = 'imageUrls' in sourceDocument ? sourceDocument.imageUrls || [] : [];
    const text = sourceDocument.text;

    // Get anomaly reason for error display
    const docAnomalyReason = 'anomalyReason' in sourceDocument ? sourceDocument.anomalyReason : null;

    async function handleRetry() {
        if (!onRetry) return;
        setIsRetrying(true);
        try {
            await onRetry();
        } finally {
            setIsRetrying(false);
        }
    }

    // Display reason from prop or from document
    const displayReason = anomalyReason || docAnomalyReason;

    return (
        <div className={cn(
            "bg-surface rounded-lg border overflow-hidden",
            status === "processing"
                ? "border-primary/30 bg-primary/5"
                : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10",
            className
        )}>
            {/* Header */}
            <div
                className={cn(
                    "px-3 py-2.5 flex justify-between items-center transition-all",
                    "cursor-pointer hover:bg-surface2/50 active:scale-[0.995]"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ChevronDown className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
                        isExpanded && "rotate-180"
                    )} />

                    {/* Time */}
                    <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </span>

                    {/* Status */}
                    <ProcessingStatus
                        status={status === "anomaly" ? "error" : "processing"}
                        className="scale-90"
                    />

                    {/* Anomaly reason preview (truncated) */}
                    {status === "anomaly" && displayReason && (
                        <>
                            <span className="text-muted-foreground/30 shrink-0">·</span>
                            <span className="text-xs text-red-500 dark:text-red-400 truncate">
                                {displayReason}
                            </span>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6 text-muted-foreground hover:text-text"
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                            {onRetry && (
                                <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                                    <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRetrying && "animate-spin")} />
                                    {tCommon("retry")}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="text-danger focus:text-danger"
                                >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    {tCommon("delete")}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
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
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
                            {/* Images */}
                            {images.length > 0 && (
                                <div className="grid gap-1.5 grid-cols-4 sm:grid-cols-5">
                                    {images.map((img, idx) => (
                                        <div
                                            key={idx}
                                            className="relative aspect-square rounded-md overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => setSelectedImageIndex(idx)}
                                        >
                                            <Image
                                                src={getSafeImageSrc(img)}
                                                alt={`Source image ${idx + 1}`}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Text */}
                            {text && (
                                <div className="text-xs text-muted-foreground bg-surface2/50 p-2 rounded text-ellipsis overflow-hidden whitespace-pre-wrap max-h-20 line-clamp-3">
                                    {text}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Image Viewer */}
            <ImageViewer
                images={images}
                initialIndex={typeof selectedImageIndex === 'number' ? selectedImageIndex : 0}
                open={selectedImageIndex !== null}
                onOpenChange={(open) => !open && setSelectedImageIndex(null)}
            />
        </div>
    );
});
