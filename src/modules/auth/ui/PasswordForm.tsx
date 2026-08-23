"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { changePasswordAction, setPasswordAction } from "@/modules/auth/actions";
import type { PasswordMutationActionErrorCode } from "@/modules/auth/contracts";

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Settings.Account");
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={visible ? "text" : "password"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          autoComplete={props.autoComplete}
          disabled={props.disabled}
          className="h-11 pr-12"
        />
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={visible ? t("hidePassword") : t("showPassword")}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function PasswordForm({
  hasPassword,
  passwordUpdatedAt,
  onRequireReauthentication,
  onCredentialsChanged,
}: {
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  onRequireReauthentication?: () => void | Promise<void>;
  onCredentialsChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPasswordUpdatedAt, setSavedPasswordUpdatedAt] = useState<string | null>(
    passwordUpdatedAt
  );
  const [savedHasPassword, setSavedHasPassword] = useState(hasPassword);

  const messageForErrorCode = (code: PasswordMutationActionErrorCode) => {
    switch (code) {
      case "password_too_short":
        return t("passwordTooShort");
      case "password_requirements_not_met":
        return t("passwordRequirementsNotMet");
      case "password_mismatch":
        return t("passwordsDoNotMatch");
      case "current_password_wrong":
        return t("currentPasswordWrong");
      case "password_rate_limited":
        return t("passwordRateLimited");
      case "reauth_required":
        return t("reauthRequired");
      case "conflict":
        return t("passwordConflict");
      case "validation_failed":
      case "unexpected":
        return t("passwordError");
    }
  };

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const submit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const input = { currentPassword, newPassword, confirmPassword };
      const result = savedHasPassword
        ? await changePasswordAction(input)
        : await setPasswordAction(input);
      if (!result.ok) {
        if (result.code === "reauth_required") {
          await onRequireReauthentication?.();
          return;
        }
        setError(messageForErrorCode(result.code));
        return;
      }
      setSavedPasswordUpdatedAt(result.passwordUpdatedAt);
      setSavedHasPassword(true);
      toast.success(t("passwordSaved"));
      setOpen(false);
      reset();
      await onCredentialsChanged?.();
    } catch {
      setError(t("passwordError"));
    } finally {
      setIsLoading(false);
    }
  };

  const matches = newPassword !== "" && newPassword === confirmPassword;
  const canSubmit = matches && (!savedHasPassword || currentPassword !== "");

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        {savedPasswordUpdatedAt == null
          ? t("passwordNotSet")
          : t("passwordLastChanged", {
              date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(savedPasswordUpdatedAt)
              ),
            })}
      </span>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && isLoading) return;
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            {savedHasPassword ? t("changePasswordButton") : t("setPasswordButton")}
          </Button>
        </DialogTrigger>
        <DialogContent
          variant="detail"
          hideCloseButton={isLoading}
          onEscapeKeyDown={(event) => isLoading && event.preventDefault()}
          onPointerDownOutside={(event) => isLoading && event.preventDefault()}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-md sm:rounded-lg"
        >
          <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
            <DialogTitle>
              {savedHasPassword ? t("changePasswordTitle") : t("setPasswordTitle")}
            </DialogTitle>
            <DialogDescription>{t("passwordRequirements")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6">
            {savedHasPassword ? (
              <PasswordField
                id="current-password"
                label={t("currentPassword")}
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                disabled={isLoading}
              />
            ) : null}
            <PasswordField
              id="new-password"
              label={t("newPassword")}
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              disabled={isLoading}
            />
            <PasswordField
              id="confirm-password"
              label={t("confirmPassword")}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              disabled={isLoading}
            />
            {confirmPassword !== "" && !matches ? (
              <p role="alert" className="text-sm text-destructive">
                {t("passwordsDoNotMatch")}
              </p>
            ) : null}
            {error != null ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              {t("cancel")}
            </Button>
            <Button onClick={submit} disabled={!canSubmit || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("savePassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
