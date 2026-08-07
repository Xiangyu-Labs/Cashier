"use client";

import type { CreatedServiceCredentialDto, ServiceCredential } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { EmailChangeForm } from "@/modules/auth/ui/EmailChangeForm";
import { PasswordForm } from "@/modules/auth/ui/PasswordForm";
import { ServiceCredentialSection } from "../ServiceCredentialSection";
import { SettingsField } from "./SettingsField";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AccountSettingsProps {
  displayEmail: string;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  credentials: ServiceCredential[];
  isPending: boolean;
  onEmailChanged: (email: string) => void;
  onCreateCredential: (name: string) => Promise<CreatedServiceCredentialDto>;
  onDeleteCredential: (id: string) => Promise<void>;
  onCredentialDialogClose: () => void;
  onSignOut: () => void | Promise<void>;
}

export function AccountSettings({
  displayEmail,
  hasPassword,
  passwordUpdatedAt,
  credentials,
  isPending,
  onEmailChanged,
  onCreateCredential,
  onDeleteCredential,
  onCredentialDialogClose,
  onSignOut,
}: AccountSettingsProps) {
  const t = useTranslations("Settings");
  const ta = useTranslations("Settings.Account");
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <SettingsSection title={t("account")}>
      <SettingsField title={ta("emailSection")} description={ta("emailSectionDesc")}>
        <EmailChangeForm currentEmail={displayEmail} onChanged={onEmailChanged} />
      </SettingsField>
      <SettingsField title={ta("passwordSection")} description={ta("passwordSectionDesc")}>
        <PasswordForm hasPassword={hasPassword} passwordUpdatedAt={passwordUpdatedAt} />
      </SettingsField>
      <ServiceCredentialSection
        credentials={credentials}
        onCreateCredential={onCreateCredential}
        onDeleteCredential={onDeleteCredential}
        onCredentialDialogClose={onCredentialDialogClose}
      />
      <SettingsField title={t("signOut")}>
        <Button
          variant="outline"
          disabled={isPending || isSigningOut}
          onClick={async () => {
            if (isSigningOut) return;
            setIsSigningOut(true);
            try {
              await onSignOut();
            } finally {
              setIsSigningOut(false);
            }
          }}
        >
          {t("signOut")}
        </Button>
      </SettingsField>
    </SettingsSection>
  );
}

export type { AccountSettingsProps };
