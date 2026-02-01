"use client";

import { useEffect, useState, useTransition } from "react";
import { getActiveSessionsAction, revokeSessionAction, updateSessionInfo, SessionInfo } from "@/features/auth/server/actions/sessions";
import { DeviceIcon } from "@/features/auth/components/DeviceIcon";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { Loader2, Trash2, Smartphone, Laptop } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Since we are adding new translations, we might need a fallback if they are missing
// or we assume the user will add them to en.json/zh.json later.
// For now, I'll use hardcoded fallbacks or generic keys if translation hook is used.

export function DeviceManagementSection() {
    const t = useTranslations("Devices");
    const tCommon = useTranslations("Common");
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Dialog state
    const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);

    useEffect(() => {
        loadSessions();
    }, []);

    async function loadSessions() {
        setIsLoading(true);
        // Opportunistically update current session info
        await updateSessionInfo();

        const result = await getActiveSessionsAction();
        if (result.success && result.data) {
            setSessions(result.data);
        } else {
            toast.error(tCommon("error"));
        }
        setIsLoading(false);
    }

    function handleRevokeClick(id: string) {
        setSessionToRevoke(id);
    }

    function handleConfirmRevoke() {
        if (!sessionToRevoke) return;

        startTransition(async () => {
            const result = await revokeSessionAction(sessionToRevoke);
            if (result.success) {
                toast.success(t("signOutSuccess"));
                setSessions(prev => prev.filter(s => s.id !== sessionToRevoke));
                router.refresh();
            } else {
                toast.error(result.error || tCommon("error"));
            }
            setSessionToRevoke(null);
        });
    }

    if (isLoading) {
        return (
            <div className="py-8 flex justify-center text-[var(--muted)]">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {sessions.map((session) => {
                // Construct display strings
                const browserName = session.device.browser.name || "";
                const osName = session.device.os.name || "";

                let deviceName = session.device.device.vendor
                    ? `${session.device.device.vendor} ${session.device.device.model || ""}`
                    : (session.device.device.type || "Desktop");

                // If mostly empty, fallback
                if (!browserName && !osName && deviceName === "Desktop") {
                    deviceName = t("unknownDevice");
                }

                const title = `${osName} ${browserName}`.trim() || deviceName;

                return (
                    <div
                        key={session.id}
                        className="flex items-center justify-between p-3 border border-[var(--border)] rounded-[var(--radius-lg)] bg-[var(--surface-2)]"
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`p-2 rounded-full shrink-0 ${session.isCurrent ? 'bg-primary/10 text-primary' : 'bg-[var(--surface)] text-[var(--muted)]'}`}>
                                <DeviceIcon type={session.device.device.type || 'desktop'} os={session.device.os.name} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[var(--text)] truncate">
                                        {title}
                                    </span>
                                    {session.isCurrent && (
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                            {t("currentDevice")}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-[var(--muted)] flex gap-2 mt-0.5 items-center">
                                    <span>{session.ipAddress || t("unknownIp")}</span>
                                    <span className="hidden sm:inline">•</span>
                                    <span className="truncate">
                                        {session.isCurrent
                                            ? t("activeNow")
                                            : session.lastActiveAt
                                                ? new Date(session.lastActiveAt).toLocaleString()
                                                : t("unknownDevice")}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {!session.isCurrent && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevokeClick(session.id)}
                                disabled={isPending}
                                className="text-[var(--muted)] hover:text-danger hover:bg-danger/10 shrink-0"
                                title={t("signOutDevice")}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                );
            })}

            {sessions.length === 0 && !isLoading && (
                <div className="text-center py-4 text-[var(--muted)] text-sm">
                    {t("noOtherDevices")}
                </div>
            )}

            {/* Revoke Confirmation Dialog */}
            <Dialog open={!!sessionToRevoke} onOpenChange={(open) => !open && setSessionToRevoke(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("confirmLogoutTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("confirmLogoutDesc")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSessionToRevoke(null)}>
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmRevoke}
                            disabled={isPending}
                        >
                            {isPending ? tCommon("loading") : tCommon("confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
