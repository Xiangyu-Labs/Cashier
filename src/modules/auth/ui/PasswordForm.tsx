"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setPassword, changePassword } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface PasswordFormProps {
  hasPassword: boolean;
}

export function PasswordForm({ hasPassword }: PasswordFormProps) {
  const t = useTranslations("Settings.Account");
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (hasPassword) {
        await changePassword(currentPassword, newPassword, confirmPassword);
      } else {
        await setPassword(newPassword, confirmPassword);
      }
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passwordError"));
    } finally {
      setIsLoading(false);
    }
  };

  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = hasPassword
    ? currentPassword.length > 0 && newPassword.length > 0 && passwordsMatch
    : newPassword.length > 0 && passwordsMatch;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {hasPassword ? t("changePasswordButton") : t("setPasswordButton")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasPassword ? t("changePasswordTitle") : t("setPasswordTitle")}
          </DialogTitle>
          <DialogDescription>
            {hasPassword ? t("changePasswordDesc") : t("setPasswordDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {hasPassword && (
            <div className="grid gap-2">
              <Label htmlFor="current-password">{t("currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("currentPasswordPlaceholder")}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("newPasswordPlaceholder")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("confirmPasswordPlaceholder")}
            />
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-sm text-destructive">{t("passwordsDoNotMatch")}</p>
          )}
          {error != null && error !== "" && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPassword ? t("changePasswordButton") : t("setPasswordButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
