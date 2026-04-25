"use client";
import { useTranslations } from "next-intl";
import { Mail, KeyRound, Lock } from "lucide-react";
import { useLoginFlow } from "../hooks/use-login-flow";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";
import { PasswordStep } from "./password-step";

export function AuthLoginPage() {
  const t = useTranslations("Auth");
  const {
    callbackUrl,
    step,
    mode,
    email,
    otp,
    password,
    isLoading,
    error,
    passwordError,
    isPasswordLoading,
    expiresAt,
    canResendAt,
    setEmail,
    setOtp,
    setPassword,
    setMode,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
    handlePasswordLogin,
  } = useLoginFlow(t);

  const isOtpMode = mode === "otp";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {isOtpMode ? (
              step === "email" ? (
                <Mail className="w-8 h-8 text-primary" />
              ) : (
                <KeyRound className="w-8 h-8 text-primary" />
              )
            ) : (
              <Lock className="w-8 h-8 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-text">
            {isOtpMode
              ? step === "email"
                ? t("welcomeBack")
                : t("verifyCode")
              : t("welcomeBack")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isOtpMode
              ? step === "email"
                ? t("welcomeBackDesc")
                : t("verifyCodeDesc", { email })
              : t("passwordLoginDesc")}
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("otp")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                isOtpMode
                  ? "bg-surface text-text shadow-sm"
                  : "text-transparent hover:text-muted-foreground"
              }`}
            >
              <Mail className={`w-4 h-4 ${isOtpMode ? "" : "text-muted-foreground"}`} />
              {t("otp")}
            </button>
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                !isOtpMode
                  ? "bg-surface text-text shadow-sm"
                  : "text-transparent hover:text-muted-foreground"
              }`}
            >
              <Lock className={`w-4 h-4 ${!isOtpMode ? "" : "text-muted-foreground"}`} />
              {t("password")}
            </button>
          </div>

          {isOtpMode ? (
            step === "email" ? (
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
            )
          ) : (
            <PasswordStep
              email={email}
              password={password}
              isLoading={isPasswordLoading}
              error={passwordError}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onSubmit={handlePasswordLogin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
