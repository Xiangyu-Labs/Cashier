import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { LedgerEntry } from "@/types/api";
import { Calendar, Edit2, Tag, Trash2 } from "lucide-react";
import { SourceDocumentOriginalContent } from "./SourceDocumentOriginalContent";
import { type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";

interface LedgerEntryViewDetailsProps {
    ledgerEntry: LedgerEntry;
    onEdit: () => void;
    onDelete: () => void;
}

export function LedgerEntryViewDetails({
    ledgerEntry,
    onEdit,
    onDelete,
}: LedgerEntryViewDetailsProps): ReactNode {
    const t = useTranslations("LedgerEntryDetail");
    const tCommon = useTranslations("Common");
    const locale = useLocale();

    // Format dates for display
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return t("unknown");
        return new Date(dateStr).toLocaleDateString(locale);
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString(locale);
    };

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-surface2 flex items-center justify-center text-3xl shadow-sm border border-border">
                    {ledgerEntry.category?.icon || "📝"}
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-semibold text-text">
                        {ledgerEntry.itemName}
                    </h3>
                    <p className="text-3xl font-bold text-primary mt-1">
                        <span className="text-lg font-normal text-muted mr-1">
                            {ledgerEntry.currency || "?"}
                        </span>
                        {parseFloat(ledgerEntry.amount).toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface2/30 p-4">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted flex items-center gap-2">
                        <Tag className="h-4 w-4" /> {t("category")}
                    </span>
                    {ledgerEntry.category ? (
                        <Badge variant="default" className="font-normal">
                            {ledgerEntry.category.name}
                        </Badge>
                    ) : (
                        <Badge variant="warning">{tCommon("unclassified")}</Badge>
                    )}
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> {t("entryDate")}
                    </span>
                    <span className="text-sm text-text">
                        {formatDate(ledgerEntry.entryDate)}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t("status")}</span>
                    <Badge variant="success">{t("confirmed")}</Badge>
                </div>

                {ledgerEntry.description && (
                    <div className="flex justify-between items-center border-t border-border/50 pt-2 mt-1">
                        <span className="text-sm text-muted">{t("description")}</span>
                        <span className="text-sm text-text max-w-[200px] truncate" title={ledgerEntry.description}>
                            {ledgerEntry.description}
                        </span>
                    </div>
                )}

                <div className="flex justify-between items-center border-t border-border/50 pt-2">
                    <span className="text-sm text-muted">{t("createdAt")}</span>
                    <span className="text-sm text-text">
                        {formatDateTime(ledgerEntry.createdAt)}
                    </span>
                </div>
            </div>

            {/* Original Input */}
            <div>
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    {t("originalInput")}
                </h4>
                <div className="p-4 bg-surface2 rounded-lg border border-border">
                    {ledgerEntry.sourceDocument ? (
                        <SourceDocumentOriginalContent
                            text={ledgerEntry.sourceDocument.text}
                            images={ledgerEntry.sourceDocument.imageUrls}
                        />
                    ) : (
                        <p className="text-muted text-sm italic">{t("noOriginal")}</p>
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
                    {tCommon("delete")}
                </Button>
                <Button onClick={onEdit}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    {t("edit")}
                </Button>
            </DialogFooter>
        </div>
    );
}
