"use client"

import { useState, useMemo, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api"
import { CategoryIcon } from "@/components/CategoryIcon"
import {
    Tag,
    Coins,
    ChevronDown,
    Check,
    X,
    Trash2,
    AlertCircle,
    FileText
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { SUPPORTED_CURRENCIES } from "@/config/currencies"

interface SourceDocumentDetailModalProps {
    sourceDocument: SourceDocument | null
    ledgerEntries: LedgerEntry[]
    categories: EntryCategory[]
    preferredCurrencies?: string[]
    mainCurrency?: string
    open: boolean
    onClose: () => void
    onUpdateTitle: (title: string) => Promise<void>
    onBatchUpdate: (ids: string[], data: { categoryId?: string, currency?: string }) => Promise<void>
    onDeleteEntry: (id: string) => Promise<void>
    onBatchDelete?: (ids: string[]) => Promise<void>
}

export function SourceDocumentDetailModal({
    sourceDocument,
    ledgerEntries,
    categories,
    preferredCurrencies = [],
    mainCurrency: _mainCurrency = "CNY",
    open,
    onClose,
    onUpdateTitle,
    onBatchUpdate,
    onDeleteEntry,
    onBatchDelete,
}: SourceDocumentDetailModalProps) {
    const t = useTranslations("SourceDocumentDetail")
    const tCommon = useTranslations("Common")
    const _tEntry = useTranslations("LedgerEntryDetail")

    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [title, setTitle] = useState(sourceDocument?.title || "")
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)

    // Reset state when modal opens
    useEffect(() => {
        if (open && sourceDocument) {
            setTitle(sourceDocument?.title || "")
            setSelectedIds([])
            setIsEditingTitle(false)
        }
    }, [open, sourceDocument])

    const handleToggleSelectAll = () => {
        if (selectedIds.length === ledgerEntries.length) {
            setSelectedIds([])
        } else {
            setSelectedIds(ledgerEntries.map(e => e.id))
        }
    }

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const handleSaveTitle = async () => {
        setIsSaving(true)
        try {
            await onUpdateTitle(title)
            setIsEditingTitle(false)
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchCategory = async (categoryId: string) => {
        if (selectedIds.length === 0) return
        setIsSaving(true)
        try {
            await onBatchUpdate(selectedIds, { categoryId })
            setSelectedIds([])
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchCurrency = async (currency: string) => {
        if (selectedIds.length === 0) return
        setIsSaving(true)
        try {
            await onBatchUpdate(selectedIds, { currency })
            setSelectedIds([])
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0 || !onBatchDelete) return
        if (!confirm(t("confirmDeleteSelected", { count: selectedIds.length }))) return

        setIsSaving(true)
        try {
            await onBatchDelete(selectedIds)
            setSelectedIds([])
        } finally {
            setIsSaving(false)
        }
    }

    const sortedCurrencies = useMemo(() => {
        const preferred = preferredCurrencies.filter(c => c !== "unknown")
        const remaining = SUPPORTED_CURRENCIES.filter(c => !preferred.includes(c))
        return [...preferred, ...remaining.sort()]
    }, [preferredCurrencies])

    if (!sourceDocument) return null

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl sm:rounded-lg">
                <DialogHeader className="px-6 py-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <FileText className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {isEditingTitle ? (
                                        <div className="flex items-center gap-2 flex-1">
                                            <Input
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder={t("titlePlaceholder")}
                                                className="h-8"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSaveTitle()
                                                    if (e.key === "Escape") setIsEditingTitle(false)
                                                }}
                                            />
                                            <Button size="icon-sm" onClick={handleSaveTitle} disabled={isSaving}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" onClick={() => setIsEditingTitle(false)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div
                                            className="flex items-center gap-2 cursor-pointer group"
                                            onClick={() => setIsEditingTitle(true)}
                                        >
                                            <span className={cn(
                                                "truncate max-w-[400px]",
                                                !sourceDocument.title && "text-muted-foreground-foreground italic"
                                            )}>
                                                {sourceDocument.title || t("titlePlaceholder")}
                                            </span>
                                            <Badge variant="outline" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                {tCommon("edit")}
                                            </Badge>
                                        </div>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="text-sm text-muted-foreground">
                                    {new Date(sourceDocument.createdAt).toLocaleString()}
                                </DialogDescription>
                            </DialogHeader>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium flex items-center gap-2">
                            {t("entries")}
                            <Badge variant="default" className="bg-surface2 text-text border-none">{ledgerEntries.length}</Badge>
                        </h4>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleToggleSelectAll}
                                className="text-xs h-8"
                            >
                                {selectedIds.length === ledgerEntries.length ? t("deselectAll") : t("selectAll")}
                            </Button>
                        </div>
                    </div>

                    {/* Batch Actions Toolbar */}
                    <AnimatePresence>
                        {selectedIds.length > 0 && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mb-4 p-3 bg-surface2/50 rounded-lg border border-primary/20 flex flex-wrap items-center gap-3"
                            >
                                <span className="text-sm font-medium text-primary">
                                    {t("selectedCount", { count: selectedIds.length })}
                                </span>

                                <div className="h-4 w-px bg-border mx-1" />

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                                            <Tag className="h-3.5 w-3.5" />
                                            {t("batchCategory")}
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-1" align="start">
                                        <div className="max-h-60 overflow-y-auto">
                                            {categories.map(cat => (
                                                <Button
                                                    key={cat.id}
                                                    variant="ghost"
                                                    className="w-full justify-start text-xs h-9 gap-2 px-2"
                                                    onClick={() => handleBatchCategory(cat.id)}
                                                >
                                                    <CategoryIcon iconName={cat.icon} className="h-3.5 w-3.5" />
                                                    {cat.name}
                                                </Button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                                            <Coins className="h-3.5 w-3.5" />
                                            {t("batchCurrency")}
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-40 p-1" align="start">
                                        <div className="max-h-60 overflow-y-auto">
                                            {sortedCurrencies.map(curr => (
                                                <Button
                                                    key={curr}
                                                    variant="ghost"
                                                    className="w-full justify-start text-xs h-9 px-2"
                                                    onClick={() => handleBatchCurrency(curr)}
                                                >
                                                    {curr}
                                                </Button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={handleBatchDelete}
                                    disabled={isSaving}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {tCommon("delete")}
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-3">
                        {ledgerEntries.length === 0 ? (
                            <div className="text-center py-12 bg-surface2/30 rounded-xl border border-dashed text-muted-foreground">
                                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>{t("noEntries")}</p>
                            </div>
                        ) : (
                            ledgerEntries.map(entry => (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        "group relative flex items-center gap-4 p-3 rounded-xl border transition-all",
                                        selectedIds.includes(entry.id)
                                            ? "bg-primary/5 border-primary/30 shadow-sm"
                                            : "bg-surface hover:border-border-hover border-border"
                                    )}
                                >
                                    <Checkbox
                                        checked={selectedIds.includes(entry.id)}
                                        onCheckedChange={() => handleToggleSelect(entry.id)}
                                        className="h-5 w-5"
                                    />

                                    <div className="h-10 w-10 rounded-full bg-surface2 flex items-center justify-center shrink-0">
                                        <CategoryIcon iconName={entry.category?.icon} className="h-5 w-5" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-sm truncate">{entry.itemName}</p>
                                            <p className="font-bold text-sm">
                                                <span className="text-[10px] text-muted-foreground mr-1">{entry.currency}</span>
                                                {parseFloat(entry.amount).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="text-[10px] h-4 font-normal py-0">
                                                {entry.category?.name || tCommon("unclassified")}
                                            </Badge>
                                            {entry.entryDate && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(entry.entryDate).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="opacity-0 group-hover:opacity-100 text-muted-foreground-foreground hover:text-destructive transition-opacity"
                                        onClick={() => onDeleteEntry(entry.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t bg-surface2/30 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        {tCommon("cancel")}
                    </Button>
                    <Button onClick={onClose} disabled={isSaving}>
                        {tCommon("confirm")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
