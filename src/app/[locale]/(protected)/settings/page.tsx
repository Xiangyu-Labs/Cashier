"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const t = useTranslations("Settings");
    const router = useRouter();

    if (status === "loading") {
        return (
            <div className="container max-w-2xl py-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    if (!session?.user?.id) {
        router.push("/login");
        return null;
    }

    const handleSignOut = async () => {
        await signOut({ redirectTo: "/login" });
    };

    return (
        <div className="container max-w-2xl py-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold">{t("title") || "Settings"}</h1>
                <p className="text-muted-foreground mt-2">
                    {t("subtitle") || "Manage your account and preferences"}
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                    <div className="space-y-1">
                        <h2 className="text-sm font-medium">{t("language") || "Language"}</h2>
                        <p className="text-xs text-muted-foreground">{t("languageDesc") || "Select your preferred language"}</p>
                    </div>
                    <LanguageSwitcher />
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-lg font-semibold">{t("account") || "Account"}</h2>
            </div>

            <div className="pt-8 border-t">
                <Button variant="destructive" className="w-full sm:w-auto" onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("signOut") || "Sign Out"}
                </Button>
            </div>
        </div>
    );
}
