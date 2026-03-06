"use client";

import { useTranslations } from "next-intl";
import { Mail, KeyRound } from "lucide-react";
import { useLoginFlow } from "./hooks/use-login-flow";
import { EmailStep } from "./components/email-step";
import { OtpStep } from "./components/otp-step";

export default function LoginPage() {
    const t = useTranslations("Auth");
    const {
        step,
        email,
        otp,
        isLoading,
        error,
        expiresAt,
        canResendAt,
        setEmail,
        setOtp,
        handleSendOTP,
        handleVerifyOTP,
        handleResendOTP,
        handleChangeEmail,
        handleOTPExpired,
    } = useLoginFlow(t);

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        {step === "email" ? (
                            <Mail className="w-8 h-8 text-primary" />
                        ) : (
                            <KeyRound className="w-8 h-8 text-primary" />
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-text">
                        {step === "email" ? t("welcomeBack") : t("verifyCode")}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        {step === "email"
                            ? t("welcomeBackDesc")
                            : t("verifyCodeDesc", { email })}
                    </p>
                </div>

                <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
                    {step === "email" ? (
                        <EmailStep
                            email={email}
                            isLoading={isLoading}
                            error={error}
                            onEmailChange={setEmail}
                            onSubmit={handleSendOTP}
                        />
                    ) : (
                        <OtpStep
                            email={email}
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
            </div>
        </div>
    );
}
