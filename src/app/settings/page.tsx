
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, LogOut, Smartphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default async function SettingsPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const t = await getTranslations("Settings");

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

                {/* Devices */}
                <Link href="/settings/devices">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium flex items-center">
                                <Smartphone className="mr-2 h-4 w-4" />
                                {t("Devices.title") || "Device Management"}
                            </CardTitle>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <CardDescription>
                                {t("Devices.description") || "Manage logged in devices and sessions"}
                            </CardDescription>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <div className="pt-8 border-t">
                <form
                    action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/login" });
                    }}
                >
                    <Button variant="destructive" className="w-full sm:w-auto">
                        <LogOut className="mr-2 h-4 w-4" />
                        {t("signOut") || "Sign Out"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
