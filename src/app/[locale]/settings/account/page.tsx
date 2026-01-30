
import { auth, signOut } from "@/auth";
import { deleteAccount } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { DeleteAccountForm } from "./DeleteAccountForm";

export default async function AccountPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const t = await getTranslations("Settings.Account");

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-destructive">{t("dangerZone") || "Danger Zone"}</h3>
                <p className="text-sm text-muted-foreground">
                    {t("dangerZoneDesc") || "Irreversible actions for your account."}
                </p>
            </div>

            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-medium text-destructive">{t("deleteTitle") || "Delete Account"}</h4>
                        <p className="text-sm text-destructive/80">
                            {t("deleteDesc") || "Permanently delete your account and all data."}
                        </p>
                    </div>
                    <DeleteAccountForm />
                </div>
            </div>
        </div>
    );
}
