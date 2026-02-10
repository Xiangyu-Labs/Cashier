"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { OTPInput } from "@/components/auth/otp-input";
import { ResendCountdown } from "@/components/auth/resend-countdown";
import { ExpiryTimer } from "@/components/auth/expiry-timer";
import { sendOTPAction, verifyOTPAction } from "@/features/auth/server/actions/auth";

type LoginStep = "email" | "otp";

export default function LoginPage() {
    const t = useTranslations("Auth");
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/";

    const [step, setStep] = useState<LoginStep>("email");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [canResendAt, setCanResendAt] = useState<number | null>(null);

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await sendOTPAction(email);
            if (!result.success) {
                setError(result.error || t("sendCodeFailed"));
                setIsLoading(false);
                return;
            }

            setExpiresAt(result.expiresAt || null);
            setCanResendAt(result.canResendAt || null);
            setStep("otp");
            setIsLoading(false);
        } catch {
            setError(t("unexpectedError"));
            setIsLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!otp || otp.length !== 6) {
            setError(t("invalidCode"));
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const verifyResult = await verifyOTPAction(email, otp);
            if (!verifyResult.success) {
                setError(verifyResult.error || t("verifyFailed"));
                setIsLoading(false);
                return;
            }

            const signInResult = await signIn("otp", {
                email,
                otp,
                redirect: false,
                callbackUrl,
            });

            if (signInResult?.error) {
                setError(signInResult.error);
                setIsLoading(false);
            } else if (signInResult?.ok) {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch {
            setError(t("unexpectedError"));
            setIsLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setError(null);
        setOtp("");
        try {
            const result = await sendOTPAction(email);
            if (!result.success) {
                setError(result.error || t("resendFailed"));
                return;
            }
            setExpiresAt(result.expiresAt || null);
            setCanResendAt(result.canResendAt || null);
        } catch {
            setError(t("resendFailed"));
        }
    };

    const handleChangeEmail = () => {
        setStep("email");
        setOtp("");
        setError(null);
        setExpiresAt(null);
        setCanResendAt(null);
    };

    const handleOTPExpired = () => {
        setError(t("codeExpiredMessage"));
    };

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
                        <form onSubmit={handleSendOTP} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium text-text">
                                    {t("email")}
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder={t("emailPlaceholder")}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={isLoading}
                                    className="h-11"
                                    autoComplete="email"
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                    {error}
                                </div>
                            )}
                            <Button
                                type="submit"
                                className="w-full h-11"
                                disabled={isLoading || !email}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("sending")}
                                    </>
                                ) : (
                                    <>
                                        <Mail className="mr-2 h-4 w-4" />
                                        {t("sendVerificationCode")}
                                    </>
                                )}
                            </Button>
                        </form>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-text">
                                        {t("enterCode")}
                                    </label>
                                    <OTPInput
                                        value={otp}
                                        onChange={setOtp}
                                        disabled={isLoading}
                                    />
                                </div>
                                <ExpiryTimer
                                    expiresAt={expiresAt}
                                    onExpired={handleOTPExpired}
                                    className="text-center"
                                />
                            </div>
                            {error && (
                                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                    {error}
                                </div>
                            )}
                            <Button
                                type="button"
                                className="w-full h-11"
                                disabled={isLoading || otp.length !== 6}
                                onClick={handleVerifyOTP}
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
                                    onClick={handleChangeEmail}
                                    disabled={isLoading}
                                    className="text-sm"
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    {t("changeEmail")}
                                </Button>
                                <ResendCountdown
                                    canResendAt={canResendAt}
                                    onResend={handleResendOTP}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                    )}
                </div>
                {step === "otp" && (
                    <p className="text-center text-xs text-muted-foreground mt-6">
                        {t("codeExpires", { minutes: 5 })}
                    </p>
                )}
            </div>
        </div>
    );
}
