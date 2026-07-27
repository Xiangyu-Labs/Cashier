"use client";

import { useTranslations } from "next-intl";
import { Mail, KeyRound } from "lucide-react";
import { useLoginFlow } from "../hooks/use-login-flow";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";
import { PasswordStep } from "./password-step";

export function AuthLoginPage({
  emailAuthEnabled = false,
  devAuthAvailable = false,
}: {
  emailAuthEnabled?: boolean;
  devAuthAvailable?: boolean;
}) {
  const t = useTranslations("Auth");
  const flow = useLoginFlow(t, devAuthAvailable);
  const passwordMode = flow.mode === "password";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface text-lg font-semibold text-primary">
            C
          </div>
          <h1 className="text-2xl font-semibold text-text">Cashier</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("productTagline")}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-none">
          {emailAuthEnabled ? (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface2 p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={passwordMode}
                onClick={() => flow.setMode("password")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${passwordMode ? "bg-surface text-text shadow-sm" : "text-muted-foreground hover:text-text"}`}
              >
                <KeyRound className="h-4 w-4" />
                {t("password")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!passwordMode}
                onClick={() => flow.setMode("otp")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${!passwordMode ? "bg-surface text-text shadow-sm" : "text-muted-foreground hover:text-text"}`}
              >
                <Mail className="h-4 w-4" />
                {t("emailCode")}
              </button>
            </div>
          ) : null}

          <div className="mb-5">
            <h2 className="text-base font-semibold text-text">
              {passwordMode
                ? t("passwordLoginTitle")
                : flow.step === "email"
                  ? t("emailLoginTitle")
                  : t("verifyCode")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {passwordMode
                ? t("passwordLoginDesc")
                : flow.step === "email"
                  ? t("emailLoginDesc")
                  : t("verifyCodeDesc", { email: flow.email })}
            </p>
          </div>

          {passwordMode ? (
            <PasswordStep
              email={flow.email}
              password={flow.password}
              isLoading={flow.isLoading}
              error={flow.error}
              onEmailChange={flow.setEmail}
              onPasswordChange={flow.setPassword}
              onSubmit={flow.handlePasswordLogin}
            />
          ) : flow.step === "email" ? (
            <EmailStep
              callbackUrl={flow.callbackUrl}
              email={flow.email}
              isLoading={flow.isLoading}
              error={flow.error}
              onEmailChange={flow.setEmail}
              onSubmit={flow.handleSendOTP}
            />
          ) : (
            <OtpStep
              otp={flow.otp}
              isLoading={flow.isLoading}
              error={flow.error}
              expiresAt={flow.expiresAt}
              canResendAt={flow.canResendAt}
              onOtpChange={flow.setOtp}
              onVerify={flow.handleVerifyOTP}
              onResend={flow.handleResendOTP}
              onChangeEmail={flow.handleChangeEmail}
              onExpired={flow.handleOTPExpired}
            />
          )}
        </div>

        {flow.isDevAuthAvailable ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-surface2/60 p-3 text-center">
            <p className="text-xs text-muted-foreground">{t("devSignInDesc")}</p>
            <button
              type="button"
              onClick={flow.handleDevSignIn}
              disabled={flow.isLoading}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50"
            >
              {t("devSignIn")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
