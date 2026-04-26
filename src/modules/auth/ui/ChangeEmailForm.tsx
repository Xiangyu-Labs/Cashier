"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { changeEmail, sendOTPAction } from "@/modules/auth/actions";
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
import { ResendCountdown } from "@/modules/auth/ui";
import { Loader2 } from "lucide-react";

interface ChangeEmailFormProps {
  currentEmail: string;
}

export function ChangeEmailForm({ currentEmail }: ChangeEmailFormProps) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const { update: updateSession } = useSession();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (newEmail === "") return;
    setIsSendingOTP(true);
    setError(null);
    try {
      const result = await sendOTPAction(newEmail, locale);
      if (result?.canResendAt != null && result.canResendAt !== 0) {
        setCanResendAt(result.canResendAt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sendOTPError"));
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleSubmit = async () => {
    if (newEmail === "" || otp === "") return;
    setIsLoading(true);
    setError(null);
    try {
      await changeEmail(newEmail, otp);
      await updateSession();
      setOpen(false);
      setNewEmail("");
      setOtp("");
      setCanResendAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("changeEmailError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("changeEmailButton")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeEmailTitle")}</DialogTitle>
          <DialogDescription>
            {t("changeEmailDesc", { email: currentEmail })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="new-email">{t("newEmail")}</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("newEmailPlaceholder")}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleSendOTP}
              disabled={newEmail === "" || isSendingOTP}
            >
              {isSendingOTP && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sendVerificationCode")}
            </Button>
            <ResendCountdown
              canResendAt={canResendAt}
              onResend={handleSendOTP}
              disabled={newEmail === ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="otp">{t("verificationCode")}</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder={t("verificationCodePlaceholder")}
            />
          </div>
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
          <Button
            onClick={handleSubmit}
            disabled={newEmail === "" || otp.length !== 6 || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("changeEmailButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
