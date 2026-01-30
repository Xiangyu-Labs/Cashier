import { auth } from "@/auth";
import { getActiveSessions } from "@/lib/auth/session";
import { revokeSession } from "@/actions/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Laptop, Smartphone, Globe, LogOut } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

function DeviceIcon({ type }: { type: string }) {
    const lower = type.toLowerCase();
    if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
        return <Smartphone className="h-5 w-5" />;
    }
    if (lower.includes("mac") || lower.includes("windows") || lower.includes("linux")) {
        return <Laptop className="h-5 w-5" />;
    }
    return <Globe className="h-5 w-5" />;
}

export default async function DevicesPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const t = await getTranslations("Settings.Devices");
    // Note: We might need to add these translations later if they don't exist

    // Get current session token from cookie to identify "current device"
    // Auth.js v5 uses secure cookies in prod, assume standard lookups or use what handled in action
    // For display, we passed "current" boolean from lib function if we pass the token.
    // We need to find the token here.
    const cookieStore = await cookies();
    const sessionTokenCookie = cookieStore.getAll().find(c => c.name.includes("session-token"));
    const currentToken = sessionTokenCookie?.value || "";

    const activeSessions = await getActiveSessions(session.user.id, currentToken);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">{t("title") || "Device Management"}</h3>
                <p className="text-sm text-muted-foreground">
                    {t("description") || "Manage devices that are currently logged in to your account."}
                </p>
            </div>

            <div className="space-y-4">
                {activeSessions.map((s) => (
                    <Card key={s.id} className={s.current ? "border-primary" : ""}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <DeviceIcon type={s.device} />
                                    <CardTitle className="text-base">
                                        {s.device}
                                        {s.current && (
                                            <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                                {t("current") || "Current Device"}
                                            </span>
                                        )}
                                    </CardTitle>
                                </div>
                                {!s.current && (
                                    <form
                                        action={async () => {
                                            "use server";
                                            await revokeSession(s.id);
                                        }}
                                    >
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                            <LogOut className="mr-2 h-4 w-4" />
                                            {t("revoke") || "Revoke"}
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-1 text-sm text-muted-foreground">
                                <div className="flex justify-between">
                                    <span>{s.ip}</span>
                                    <span>
                                        {s.lastActive
                                            ? formatDistanceToNow(s.lastActive, { addSuffix: true, locale: zhCN })
                                            : "Unknown"}
                                    </span>
                                </div>
                                <div className="text-xs truncate" title={s.ua}>
                                    {s.ua}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {activeSessions.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                        No active sessions found.
                    </div>
                )}
            </div>
        </div>
    );
}
