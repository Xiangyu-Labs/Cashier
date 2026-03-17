"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DeleteAccountForm } from "./DeleteAccountForm";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const t = useTranslations("Settings.Account");
  const router = useRouter();

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (session?.user?.id == null) {
    router.push("/login");
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-destructive">{t("dangerZone") !== "" ? t("dangerZone") : "Danger Zone"}</h3>
        <p className="text-sm text-muted-foreground">
          {t("dangerZoneDesc") !== "" ? t("dangerZoneDesc") : "Irreversible actions for your account."}
        </p>
      </div>

      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-destructive">{t("deleteTitle") !== "" ? t("deleteTitle") : "Delete Account"}</h4>
            <p className="text-sm text-destructive/80">
              {t("deleteDesc") !== "" ? t("deleteDesc") : "Permanently delete your account and all data."}
            </p>
          </div>
          <DeleteAccountForm />
        </div>
      </div>
    </div>
  );
}
