"use client";
import { useTranslations } from "next-intl";
import { useLoginFlow } from "../hooks/use-login-flow";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";

export function AuthLoginPage() {
  const t = useTranslations("Auth");
  const {
    callbackUrl,
    step,
    email,
    otp,
    isLoading,
    error,
    expiresAt,
    canResendAt,
    isDevAuthAvailable,
    setEmail,
    setOtp,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
    handleDevSignIn,
  } = useLoginFlow(t);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="max-w-md w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface text-lg font-semibold text-primary">
            C
          </div>
          <h1 className="text-2xl font-semibold text-text">Cashier</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("productTagline")}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-none">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-text">
              {step === "email" ? t("emailLoginTitle") : t("verifyCode")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "email" ? t("emailLoginDesc") : t("verifyCodeDesc", { email })}
            </p>
          </div>
          {step === "email" ? (
            <EmailStep
              callbackUrl={callbackUrl}
              email={email}
              isLoading={isLoading}
              error={error}
              onEmailChange={setEmail}
              onSubmit={handleSendOTP}
            />
          ) : (
            <OtpStep
              otp={otp}
              isLoading={isLoading}
              error={error}
              expiresAt={expiresAt}
              canResendAt={canResendAt}
              onOtpChange={setOtp}
              onVerify={handleVerifyOTP}
              onResend={handleResendOTP}
              onChangeEmail={handleChangeEmail}
              onExpired={handleOTPExpired}
            />
          )}
        </div>

        {isDevAuthAvailable && (
          <div className="mt-4 rounded-md border border-dashed border-border bg-surface2/60 p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("devSignInDesc")}</p>
            <button
              type="button"
              onClick={handleDevSignIn}
              disabled={isLoading}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 sm:min-h-9"
            >
              {t("devSignIn")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
