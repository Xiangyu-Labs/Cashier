"use client"

import { useState, useMemo, useEffect, memo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api"
import { CategoryIcon } from "@/components/CategoryIcon"
import {
    Tag,
    Coins,
    ChevronDown,
    Check,
    Trash2,
    FileText,
    Calendar,
    AlignLeft,
    X,
    Save,
    RefreshCw
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { SUPPORTED_CURRENCIES } from "@/config/currencies"
import { SourceDocumentViewDetails, PendingChanges, SourceDocPendingChanges, EntriesPendingChanges } from "./SourceDocumentViewDetails"
import { EntryEditData } from "@/features/ledger/components/EditableBillEntryItem"
import { EditableField } from "@/components/ui/editable-field"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog"

interface SourceDocumentDetailModalProps {
    ledgerId: string
    sourceDocument: SourceDocument | null
    isLoading?: boolean
    ledgerEntries: LedgerEntry[]
    categories: EntryCategory[]
    preferredCurrencies?: string[]
    mainCurrency?: string
    open: boolean
    onClose: () => void
    onUpdateSourceDoc: (data: { title?: string; entryDate?: string }) => Promise<void>
    onUpdateEntry: (id: string, data: Partial<EntryEditData>) => Promise<void>
    onBatchUpdate: (ids: string[], data: {
        categoryId?: string,
        currency?: string,
        entryDate?: string,
        description?: string
    }) => Promise<void>
    onDeleteEntry: (id: string) => Promise<void>
    onBatchDelete?: (ids: string[]) => Promise<void>
    onDelete?: () => void
}

export const SourceDocumentDetailModal = memo(function SourceDocumentDetailModal({
    ledgerId,
    sourceDocument,
    isLoading = false,
    ledgerEntries,
    categories,
    preferredCurrencies = [],
    mainCurrency: _mainCurrency = "CNY",
    open,
    onClose,
    onUpdateSourceDoc,
    onUpdateEntry,
    onBatchUpdate,
    onDeleteEntry,
    onBatchDelete,
    onDelete,
}: SourceDocumentDetailModalProps) {
    const t = useTranslations("SourceDocumentDetail")
    const tCommon = useTranslations("Common")

    // Pending changes state - changes are accumulated here until saved
    const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
        sourceDoc: {},
        entries: {}
    })
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
    const [showRetryDialog, setShowRetryDialog] = useState(false)

    // Batch operation states
    const [batchDate, setBatchDate] = useState("")
    const [batchDescription, setBatchDescription] = useState("")

    // Reset state when modal opens
    useEffect(() => {
        if (open && sourceDocument) {
            setPendingChanges({ sourceDoc: {}, entries: {} })
            setSelectedIds([])
            setIsSelectionMode(false)
            setBatchDate("")
            setBatchDescription("")
        }
    }, [open, sourceDocument])

    // Check if there are any pending changes
    const hasPendingChanges = useMemo(() => {
        const hasSourceDocChanges = Object.keys(pendingChanges.sourceDoc).length > 0
        const hasEntryChanges = Object.keys(pendingChanges.entries).length > 0
        return hasSourceDocChanges || hasEntryChanges
    }, [pendingChanges])

    // Count pending changes
    const pendingChangesCount = useMemo(() => {
        let count = Object.keys(pendingChanges.sourceDoc).length
        Object.values(pendingChanges.entries).forEach(changes => {
            count += Object.keys(changes).length
        })
        return count
    }, [pendingChanges])

    // Handle close with unsaved changes check
    const handleClose = useCallback(() => {
        if (hasPendingChanges) {
            setShowUnsavedConfirm(true)
        } else {
            onClose()
        }
    }, [hasPendingChanges, onClose])

    // Save all changes and close (for unsaved changes dialog)
    const handleSaveAllAndClose = useCallback(async () => {
        await handleSaveAll()
        setShowUnsavedConfirm(false)
        onClose()
    }, [handleSaveAll, onClose])

    // Discard all changes and close (for unsaved changes dialog) - only discards changes, does NOT delete the document
    const handleDiscardAndClose = useCallback(() => {
        setPendingChanges({ sourceDoc: {}, entries: {} })
        setShowUnsavedConfirm(false)
        onClose()
    }, [onClose])

    // Handle source doc field changes - only add if value actually changed
    const handleSourceDocChange = useCallback((changes: SourceDocPendingChanges) => {
        if (!sourceDocument) return
        setPendingChanges(prev => {
            const next = { ...prev.sourceDoc }
            for (const [key, value] of Object.entries(changes)) {
                const field = key as keyof SourceDocPendingChanges
                let originalValue: string | undefined
                if (field === "title") {
                    originalValue = sourceDocument.title ?? ""
                } else if (field === "entryDate") {
                    originalValue = sourceDocument.entryDate?.split("T")[0] || ""
                }

                if (value === originalValue) {
                    delete next[field]
                } else {
                    (next as Record<string, string | undefined>)[field] = value
                }
            }
            return { ...prev, sourceDoc: next }
        })
    }, [sourceDocument])

    // Handle entry field changes - only add if value actually changed
    const handleEntryChange = useCallback((entryId: string, changes: Partial<EntryEditData>) => {
        const entry = ledgerEntries?.find(e => e.id === entryId)
        if (!entry) return

        setPendingChanges(prev => {
            const entryChanges = { ...prev.entries[entryId] }

            for (const [key, value] of Object.entries(changes)) {
                const field = key as keyof EntryEditData
                let originalValue: string | number | null | undefined

                switch (field) {
                    case "itemName": originalValue = entry.itemName; break
                    case "amount": originalValue = entry.amount; break
                    case "currency": originalValue = entry.currency; break
                    case "categoryId": originalValue = entry.categoryId; break
                    case "description": originalValue = entry.description; break
                    default: originalValue = undefined
                }

                if (value === originalValue) {
                    delete entryChanges[field]
                } else {
                    (entryChanges as Record<string, unknown>)[field] = value
                }
            }

            // If no changes left, remove the entry from pending
            if (Object.keys(entryChanges).length === 0) {
                const { [entryId]: _, ...rest } = prev.entries
                return { ...prev, entries: rest }
            }

            return {
                ...prev,
                entries: { ...prev.entries, [entryId]: entryChanges }
            }
        })
    }, [ledgerEntries])

    // Handle entry selection
    const handleSelectEntry = useCallback((entryId: string, selected: boolean) => {
        setSelectedIds(prev =>
            selected ? [...prev, entryId] : prev.filter(id => id !== entryId)
        )
    }, [])

    // Handle select all
    const handleSelectAllEntries = useCallback((selected: boolean) => {
        setSelectedIds(selected ? ledgerEntries.map(e => e.id) : [])
    }, [ledgerEntries])

    // Toggle selection mode
    const handleToggleSelectionMode = useCallback(() => {
        setIsSelectionMode(prev => {
            if (prev) {
                // Exiting selection mode, clear selections
                setSelectedIds([])
            }
            return !prev
        })
    }, [])

    // Save all pending changes
    const handleSaveAll = useCallback(async () => {
        setIsSaving(true)
        try {
            // Save source doc changes
            if (Object.keys(pendingChanges.sourceDoc).length > 0) {
                await onUpdateSourceDoc(pendingChanges.sourceDoc)
            }

            // Save entry changes
            for (const [entryId, changes] of Object.entries(pendingChanges.entries)) {
                if (Object.keys(changes).length > 0) {
                    await onUpdateEntry(entryId, changes)
                }
            }

            // Clear pending changes after successful save
            setPendingChanges({ sourceDoc: {}, entries: {} })
        } catch (error) {
            console.error("Failed to save changes:", error)
        } finally {
            setIsSaving(false)
        }
    }, [pendingChanges, onUpdateSourceDoc, onUpdateEntry])

    // Discard all changes
    const handleDiscardAll = useCallback(() => {
        setPendingChanges({ sourceDoc: {}, entries: {} })
    }, [])

    // Batch operations
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

    const handleBatchDate = async () => {
        if (selectedIds.length === 0 || !batchDate) return
        setIsSaving(true)
        try {
            await onBatchUpdate(selectedIds, { entryDate: batchDate })
            setSelectedIds([])
            setBatchDate("")
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchDescription = async () => {
        if (selectedIds.length === 0) return
        setIsSaving(true)
        try {
            await onBatchUpdate(selectedIds, { description: batchDescription })
            setSelectedIds([])
            setBatchDescription("")
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

    const handleDeleteDocument = () => {
        onDelete?.()
        setShowDeleteConfirm(false)
    }

    const sortedCurrencies = useMemo(() => {
        const preferred = preferredCurrencies.filter(c => c !== "unknown")
        const remaining = SUPPORTED_CURRENCIES.filter(c => !preferred.includes(c))
        return [...preferred, ...remaining.sort()]
    }, [preferredCurrencies])

    // Display title with pending changes
    const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? ""

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border">
                <DialogHeader className="px-5 py-3 border-b shrink-0 flex-row items-center gap-3 space-y-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0 pr-8">
                        <EditableField
                            value={displayTitle}
                            onChange={(v) => handleSourceDocChange({ title: v })}
                            placeholder={t("untitled")}
                            displayClassName="font-semibold text-text text-base truncate"
                            inputClassName="font-semibold text-base"
                        />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                    {/* Loading Skeleton State */}
                    {isLoading && !sourceDocument && (
                        <div className="space-y-3 animate-pulse">
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded bg-border" />
                                <div className="h-3 w-24 bg-border rounded" />
                            </div>
                            <div className="rounded-xl border border-border p-3 space-y-2">
                                <div className="h-3 w-16 bg-border rounded" />
                                <div className="h-6 w-28 bg-border rounded" />
                            </div>
                            <div className="space-y-2">
                                {[1, 2].map(i => (
                                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                                        <div className="h-8 w-8 rounded-full bg-border" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3.5 w-28 bg-border rounded" />
                                            <div className="h-2.5 w-16 bg-border rounded" />
                                        </div>
                                        <div className="h-3.5 w-14 bg-border rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actual Content */}
                    {sourceDocument && (
                        <SourceDocumentViewDetails
                            sourceDocument={sourceDocument}
                            ledgerEntries={ledgerEntries}
                            categories={categories}
                            preferredCurrencies={preferredCurrencies}
                            mainCurrency={_mainCurrency}
                            pendingChanges={pendingChanges}
                            selectedEntryIds={selectedIds}
                            isSelectionMode={isSelectionMode}
                            onSourceDocChange={handleSourceDocChange}
                            onEntryChange={handleEntryChange}
                            onSelectEntry={handleSelectEntry}
                            onSelectAllEntries={handleSelectAllEntries}
                            onToggleSelectionMode={handleToggleSelectionMode}
                        />
                    )}
                </div>

                {/* Batch Actions Toolbar - appears when entries are selected */}
                <AnimatePresence>
                    {selectedIds.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="shrink-0 px-4 py-2 border-t bg-primary/5 border-primary/20"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="default" className="bg-primary/20 text-primary border-none">
                                    {t("selectedCount", { count: selectedIds.length })}
                                </Badge>

                                <div className="h-4 w-px bg-border mx-1" />

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Popover modal={true}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 gap-1">
                                                <Tag className="h-3 w-3" />
                                                {t("batchCategory")}
                                                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-1" align="start">
                                            <div className="max-h-48 overflow-y-auto">
                                                {categories.map(cat => (
                                                    <Button
                                                        key={cat.id}
                                                        variant="ghost"
                                                        className="w-full justify-start text-xs h-8 gap-2 px-2"
                                                        onClick={() => handleBatchCategory(cat.id)}
                                                    >
                                                        <CategoryIcon iconName={cat.icon} className="h-3.5 w-3.5" />
                                                        {cat.name}
                                                    </Button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover modal={true}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 gap-1">
                                                <Coins className="h-3 w-3" />
                                                {t("batchCurrency")}
                                                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-32 p-1" align="start">
                                            <div className="max-h-48 overflow-y-auto">
                                                {sortedCurrencies.map(curr => (
                                                    <Button
                                                        key={curr}
                                                        variant="ghost"
                                                        className="w-full justify-start text-xs h-8 px-2"
                                                        onClick={() => handleBatchCurrency(curr)}
                                                    >
                                                        {curr}
                                                    </Button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover modal={true}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {t("batchDate")}
                                                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-3" align="start">
                                            <div className="space-y-2">
                                                <input
                                                    type="date"
                                                    value={batchDate}
                                                    onChange={(e) => setBatchDate(e.target.value)}
                                                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                />
                                                <Button
                                                    size="sm"
                                                    className="w-full h-8"
                                                    onClick={handleBatchDate}
                                                    disabled={!batchDate}
                                                >
                                                    {tCommon("apply")}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover modal={true}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 gap-1">
                                                <AlignLeft className="h-3 w-3" />
                                                {t("batchDescription")}
                                                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="start">
                                            <div className="space-y-2">
                                                <Textarea
                                                    value={batchDescription}
                                                    onChange={(e) => setBatchDescription(e.target.value)}
                                                    placeholder={t("batchDescriptionPlaceholder")}
                                                    className="min-h-[60px] text-xs"
                                                />
                                                <Button
                                                    size="sm"
                                                    className="w-full h-8"
                                                    onClick={handleBatchDescription}
                                                >
                                                    {tCommon("apply")}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    {onBatchDelete && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[10px] px-2 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                            onClick={handleBatchDelete}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                            {tCommon("delete")}
                                        </Button>
                                    )}
                                </div>

                                <div className="flex-1" />

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px]"
                                    onClick={() => setSelectedIds([])}
                                >
                                    {t("deselectAll")}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bottom Actions */}
                <div className="shrink-0 px-4 py-3 border-t bg-surface/80 backdrop-blur-md sm:bg-surface2/30 flex justify-between items-center gap-2 z-50">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                            onClick={() => setShowDeleteConfirm(true)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{tCommon("delete")}</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 gap-1.5 text-muted-foreground"
                            onClick={() => setShowRetryDialog(true)}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{t("editRetry")}</span>
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <AnimatePresence>
                            {hasPendingChanges && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex items-center gap-2"
                                >
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9"
                                        onClick={handleDiscardAll}
                                    >
                                        <X className="h-3.5 w-3.5 mr-1.5" />
                                        {t("discardChanges")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-9 gap-1.5 shadow-lg shadow-primary/20"
                                        onClick={handleSaveAll}
                                        disabled={isSaving}
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                        {t("saveChanges", { count: pendingChangesCount })}
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

            </DialogContent>

            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title={tCommon("delete")}
                description={t("deleteConfirmDesc")}
                onConfirm={handleDeleteDocument}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            <ConfirmDialog
                open={showUnsavedConfirm}
                onOpenChange={setShowUnsavedConfirm}
                title={t("unsavedChanges")}
                description={t("unsavedChangesDesc")}
                onConfirm={() => setShowUnsavedConfirm(false)}
                cancelLabel={tCommon("cancel")}
                onSave={handleSaveAllAndClose}
                saveLabel={tCommon("save")}
                onDiscard={handleDiscardAndClose}
                discardLabel={t("discardChanges")}
            />

            {/* Edit Retry Dialog */}
            {sourceDocument && (
                <SourceDocumentEditRetryDialog
                    ledgerId={ledgerId}
                    sourceDocument={sourceDocument}
                    open={showRetryDialog}
                    onOpenChange={setShowRetryDialog}
                    onSuccess={() => {
                        setShowRetryDialog(false)
                        onClose()
                    }}
                />
            )}
        </Dialog>
    )
});
