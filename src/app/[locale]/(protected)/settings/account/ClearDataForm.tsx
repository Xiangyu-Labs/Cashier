"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { clearUserData, sendOTPAction } from "@/modules/auth/actions";
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

interface ClearDataFormProps {
  currentEmail: string;
}

export function ClearDataForm({ currentEmail }: ClearDataFormProps) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [otp, setOtp] = useState("");
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    setIsSendingOTP(true);
    setError(null);
    try {
      const result = await sendOTPAction(currentEmail, locale);
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
    if (confirmText !== "CLEAR" || otp === "") return;
    setIsLoading(true);
    setError(null);
    try {
      await clearUserData();
      setOpen(false);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clearDataError"));
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("clearDataButton")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clearDataTitle")}</DialogTitle>
          <DialogDescription>{t("clearDataDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="clear-confirm">{t("clearConfirmLabel")}</Label>
            <Input
              id="clear-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CLEAR"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleSendOTP}
              disabled={isSendingOTP}
            >
              {isSendingOTP && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sendVerificationCode")}
            </Button>
            <ResendCountdown
              canResendAt={canResendAt}
              onResend={handleSendOTP}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clear-otp">{t("verificationCode")}</Label>
            <Input
              id="clear-otp"
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
            variant="destructive"
            onClick={handleSubmit}
            disabled={confirmText !== "CLEAR" || otp.length !== 6 || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("clearDataButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
