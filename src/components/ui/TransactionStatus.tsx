import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export type TransactionStatusType = "queued" | "processing" | "to_confirm" | "completed" | "failed" | "invalid";

interface TransactionStatusProps {
    status: TransactionStatusType;
    className?: string;
}

export function TransactionStatus({ status, className }: TransactionStatusProps) {
    const config = {
        queued: {
            label: "排队中",
            icon: Clock,
            colorClass: "text-muted-foreground",
            bgClass: "bg-muted",
        },
        processing: {
            label: "处理中",
            icon: Loader2,
            colorClass: "text-info",
            bgClass: "bg-info",
        },
        to_confirm: {
            label: "待确认",
            icon: AlertCircle, // Or maybe a question mark / edit icon?
            colorClass: "text-warning",
            bgClass: "bg-warning",
        },
        completed: {
            label: "已完成",
            icon: CheckCircle2,
            colorClass: "text-primary",
            bgClass: "bg-primary",
        },
        failed: {
            label: "处理失败",
            icon: AlertCircle,
            colorClass: "text-danger",
            bgClass: "bg-danger",
        },
        invalid: {
            label: "无效账单",
            icon: AlertCircle,
            colorClass: "text-danger",
            bgClass: "bg-danger",
        },
    };

    if (status === "completed") {
        return null;
    }

    const configItem = config[status];
    const { label, icon: Icon, colorClass, bgClass } = configItem;

    return (
        <div className={cn("inline-flex items-center gap-2", className)}>
            <div className="relative flex items-center justify-center">
                {status === "processing" ? (
                    <Icon className={cn("w-3.5 h-3.5 animate-spin", colorClass)} />
                ) : (
                    <div className={cn("w-2 h-2 rounded-full", bgClass)} />
                )}
            </div>
            <span className={cn("text-xs font-medium", colorClass)}>
                {label}
            </span>
        </div>
    );
}
