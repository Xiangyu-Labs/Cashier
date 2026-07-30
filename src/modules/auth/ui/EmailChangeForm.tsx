"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendEmailChangeCodeAction, verifyEmailChangeCodeAction } from "../actions";
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
}: {
  currentEmail: string;
  onChanged?: (email: string) => void;
}) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setCode("");
    setSent(false);
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
      await sendEmailChangeCodeAction(email, locale);
      setSent(true);
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
      toast.success(t("emailChanged"));
      onChanged?.(result.email);
      close();
    } catch {
      setError(t("emailChangeError"));
      toast.error(t("emailChangeError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between" data-tab-swipe-ignore>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{currentEmail}</span>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">{t("changeEmailButton")}</Button>
        </DialogTrigger>
        <DialogContent variant="modal">
          <DialogHeader>
            <DialogTitle>{t("changeEmailTitle")}</DialogTitle>
            <DialogDescription>{t("emailSectionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
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
                <Button variant="outline" disabled={pending || email.trim() === ""} onClick={send}>
                  {pending && !sent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t(sent ? "resendCode" : "sendCode")}
                </Button>
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
            {error != null ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
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
