import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { Copy, Check, Share2, Link as LinkIcon, Loader2 } from "lucide-react";
import { createShareAction } from "@/actions/shares";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { cn, copyToClipboard } from "@/lib/utils";

interface ShareDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    ledgerId: string;
    sourceDocumentId: string;
}

export function ShareDialog({
    isOpen,
    onOpenChange,
    ledgerId,
    sourceDocumentId,
}: ShareDialogProps) {
    const t = useTranslations("Share");
    const [expiresIn, setExpiresIn] = useState<"1d" | "7d" | "30d" | "never">("7d");
    const [isLoading, setIsLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [hasCopied, setHasCopied] = useState(false);

    const handleCreateShare = async () => {
        setIsLoading(true);
        try {
            const result = await createShareAction(ledgerId, sourceDocumentId, { expiresIn });
            if (result.success && result.data) {
                // Ensure full URL if action returns relative
                const url = result.data.shareUrl.startsWith("http")
                    ? result.data.shareUrl
                    : `${window.location.origin}${result.data.shareUrl}`; // Construct full URL client-side
                setShareUrl(url);
                toast.success(t("shareSuccess"));
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(error);
            toast.error(t("createFailed"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!shareUrl) return;
        const success = await copyToClipboard(shareUrl);
        if (success) {
            setHasCopied(true);
            toast.success(t("copied"));
            setTimeout(() => setHasCopied(false), 2000);
        } else {
            toast.error(t("copyFailed"));
        }
    };

    const resetState = () => {
        setShareUrl(null);
        setExpiresIn("7d");
        setIsLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            onOpenChange(open);
            if (!open) setTimeout(resetState, 300); // Reset after transition
        }}>
            <DialogContent className="sm:max-w-md overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-primary" />
                        {t("title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("description")}
                    </DialogDescription>
                </DialogHeader>

                <AnimatePresence mode="wait">
                    {!shareUrl ? (
                        <motion.div
                            key="create-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4 py-4"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="expiration">{t("expiration")}</Label>
                                <Select
                                    value={expiresIn}
                                    onValueChange={(value) => setExpiresIn(value as "1d" | "7d" | "30d" | "never")}
                                >
                                    <SelectTrigger id="expiration">
                                        <SelectValue placeholder={t("selectExpiration")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1d">{t("1day")}</SelectItem>
                                        <SelectItem value="7d">{t("7days")}</SelectItem>
                                        <SelectItem value="30d">{t("30days")}</SelectItem>
                                        <SelectItem value="never">{t("never")}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground my-1">
                                    {expiresIn === "never"
                                        ? t("neverExpiresDesc")
                                        : t("expiresDesc", { count: expiresIn === "1d" ? 1 : expiresIn === "7d" ? 7 : 30 })}
                                </p>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="result-step"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4 py-4"
                        >
                            <div className="flex items-center space-x-2 w-full">
                                <div className="grid flex-1 gap-2 w-full">
                                    <Label htmlFor="link" className="sr-only">
                                        Link
                                    </Label>
                                    <div className="relative w-full">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                                            <LinkIcon className="h-4 w-4" />
                                        </div>
                                        <input
                                            id="link"
                                            className="flex h-10 w-full rounded-md border border-input bg-surface pl-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                            value={shareUrl}
                                            readOnly
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <Button
                                    type="button"
                                    onClick={handleCopy}
                                    className="w-full"
                                    variant={hasCopied ? "outline" : "default"}
                                >
                                    {hasCopied ? (
                                        <>
                                            <Check className="mr-2 h-4 w-4" />
                                            {t("copied")}
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-2 h-4 w-4" />
                                            {t("copyLink")}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <DialogFooter className="sm:justify-between sm:flex-row-reverse">
                    {!shareUrl ? (
                        <Button onClick={handleCreateShare} disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t("createLink")}
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                            {t("close")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
