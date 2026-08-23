"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendEmailChangeCodeAction, verifyEmailChangeCodeAction } from "../actions";
import type { EmailChangeErrorCode } from "../server-actions/change-email";
import { ResendCountdown } from "./resend-countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EmailChangeForm({
  currentEmail,
  onChanged,
  onRequireReauthentication,
  onCredentialsChanged,
}: {
  currentEmail: string;
  onChanged?: (email: string) => void;
  onRequireReauthentication?: () => void | Promise<void>;
  onCredentialsChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);

  const errorMessage = (code: EmailChangeErrorCode) => {
    switch (code) {
      case "invalid_email":
        return t("emailChangeErrors.invalid_email");
      case "reauth_required":
        return t("emailChangeErrors.reauth_required");
      case "invalid_code":
        return t("emailChangeErrors.invalid_code");
      case "expired_code":
        return t("emailChangeErrors.expired_code");
      case "email_in_use":
        return t("emailChangeErrors.email_in_use");
      case "rate_limited":
        return t("emailChangeErrors.rate_limited");
      case "locked":
        return t("emailChangeErrors.locked");
      case "same_email":
        return t("emailChangeErrors.same_email");
      case "unknown":
        return t("emailChangeErrors.unknown");
    }
  };

  const reset = () => {
    setEmail("");
    setCode("");
    setSent(false);
    setCanResendAt(null);
    setError(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const send = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await sendEmailChangeCodeAction(email, locale);
      if (!result.ok) {
        if (result.code === "reauth_required") {
          await onRequireReauthentication?.();
          return;
        }
        const message = errorMessage(result.code);
        setError(message);
        toast.error(message);
        return;
      }
      setSent(true);
      setCode("");
      setCanResendAt(result.canResendAt);
      toast.success(t("emailCodeSent"));
    } catch {
      setError(t("emailChangeError"));
      toast.error(t("emailChangeError"));
    } finally {
      setPending(false);
    }
  };
  const verify = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await verifyEmailChangeCodeAction(email, code);
      if (!result.ok) {
        const message = errorMessage(result.code);
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(t("emailChanged"));
      onChanged?.(result.email);
      close();
      await onCredentialsChanged?.();
    } catch {
      setError(t("emailChangeError"));
      toast.error(t("emailChangeError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
      data-tab-swipe-ignore
    >
      <span className="min-w-0 truncate text-sm text-muted-foreground">{currentEmail}</span>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && pending) return;
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">{t("changeEmailButton")}</Button>
        </DialogTrigger>
        <DialogContent
          variant="detail"
          hideCloseButton={pending}
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onPointerDownOutside={(event) => pending && event.preventDefault()}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:rounded-lg"
        >
          <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
            <DialogTitle>{t("changeEmailTitle")}</DialogTitle>
            <DialogDescription>{t("emailSectionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-2">
              <Label htmlFor="new-account-email">{t("newEmail")}</Label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  id="new-account-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSent(false);
                    setCode("");
                    setError(null);
                  }}
                  disabled={pending}
                  className="h-11 min-w-0 flex-1"
                />
                {sent ? (
                  <ResendCountdown
                    canResendAt={canResendAt}
                    disabled={pending || email.trim() === ""}
                    onResend={send}
                  />
                ) : (
                  <Button
                    variant="outline"
                    disabled={pending || email.trim() === ""}
                    onClick={send}
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("sendCode")}
                  </Button>
                )}
              </div>
            </div>
            {sent ? (
              <div className="grid gap-2">
                <Label htmlFor="email-verification-code">{t("verificationCode")}</Label>
                <Input
                  id="email-verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  disabled={pending}
                  className="h-11"
                />
              </div>
            ) : null}
            {error != null ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
            <Button variant="outline" onClick={close} disabled={pending}>
              {t("cancel")}
            </Button>
            {sent ? (
              <Button disabled={pending || code.length !== 6} onClick={verify}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("verifyEmail")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
