"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { OTPInput } from "@/components/auth/otp-input";
import { ResendCountdown } from "@/components/auth/resend-countdown";
import { ExpiryTimer } from "@/components/auth/expiry-timer";
import { OTP_LENGTH } from "@/modules/auth/actions";

interface OtpStepProps {
  email: string;
  otp: string;
  isLoading: boolean;
  error: string | null;
  expiresAt: number | null;
  canResendAt: number | null;
  onOtpChange: (otp: string) => void;
  onVerify: () => void;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  onExpired: () => void;
}

export function OtpStep({
  email: _email,
  otp,
  isLoading,
  error,
  expiresAt,
  canResendAt,
  onOtpChange,
  onVerify,
  onResend,
  onChangeEmail,
  onExpired,
}: OtpStepProps) {
  const t = useTranslations("Auth");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text">{t("enterCode")}</label>
          <OTPInput value={otp} onChange={onOtpChange} disabled={isLoading} />
        </div>
        <ExpiryTimer expiresAt={expiresAt} onExpired={onExpired} className="text-center" />
      </div>
      {error != null && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <Button
        type="button"
        className="w-full h-11"
        disabled={isLoading || otp.length !== OTP_LENGTH}
        onClick={onVerify}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("verifying")}
          </>
        ) : (
          t("verify")
        )}
      </Button>
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={onChangeEmail}
          disabled={isLoading}
          className="text-sm"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("changeEmail")}
        </Button>
        <ResendCountdown canResendAt={canResendAt} onResend={onResend} disabled={isLoading} />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {t("codeExpires", { minutes: 5 })}
      </p>
    </div>
  );
}
