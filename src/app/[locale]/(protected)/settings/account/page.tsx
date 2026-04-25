"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { PasswordForm } from "./PasswordForm";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ClearDataForm } from "./ClearDataForm";

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

  const currentEmail = session.user.email ?? "";
  const hasPassword = session.user.hasPassword ?? false;

  return (
    <div className="space-y-8">
      {/* Email Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("emailSection")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("emailSectionDesc")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("currentEmail")}</p>
              <p className="text-sm text-muted-foreground">{currentEmail}</p>
            </div>
            <ChangeEmailForm currentEmail={currentEmail} />
          </div>
        </div>
      </div>

      {/* Password Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("passwordSection")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("passwordSectionDesc")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {hasPassword ? t("passwordSet") : t("passwordNotSet")}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasPassword
                  ? t("passwordSetDesc")
                  : t("passwordNotSetDesc")}
              </p>
            </div>
            <PasswordForm hasPassword={hasPassword} />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-destructive">
            {t("dangerZone")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("dangerZoneDesc")}
          </p>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-destructive">
                {t("clearDataTitle")}
              </h4>
              <p className="text-sm text-destructive/80">
                {t("clearDataDesc")}
              </p>
            </div>
            <ClearDataForm currentEmail={currentEmail} />
          </div>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-destructive">
                {t("deleteTitle")}
              </h4>
              <p className="text-sm text-destructive/80">
                {t("deleteDesc")}
              </p>
            </div>
            <DeleteAccountForm currentEmail={currentEmail} />
          </div>
        </div>
      </div>
    </div>
  );
}
