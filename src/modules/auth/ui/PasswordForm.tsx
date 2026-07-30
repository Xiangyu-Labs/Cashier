"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
}: {
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
}) {
  const t = useTranslations("Settings.Account");
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (hasPassword) await changePasswordAction(input);
      else await setPasswordAction(input);
      toast.success(t("passwordSaved"));
      setOpen(false);
      reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("passwordError"));
    } finally {
      setIsLoading(false);
    }
  };

  const matches = newPassword !== "" && newPassword === confirmPassword;
  const canSubmit = matches && (!hasPassword || currentPassword !== "");

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        {passwordUpdatedAt == null
          ? t("passwordNotSet")
          : t("passwordLastChanged", {
              date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                new Date(passwordUpdatedAt)
              ),
            })}
      </span>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            {hasPassword ? t("changePasswordButton") : t("setPasswordButton")}
          </Button>
        </DialogTrigger>
        <DialogContent variant="modal">
          <DialogHeader>
            <DialogTitle>
              {hasPassword ? t("changePasswordTitle") : t("setPasswordTitle")}
            </DialogTitle>
            <DialogDescription>{t("passwordRequirements")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {hasPassword ? (
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
          <DialogFooter>
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
