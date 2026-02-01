"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { OTPInput } from "@/components/auth/otp-input";
import { ResendCountdown } from "@/components/auth/resend-countdown";
import { ExpiryTimer } from "@/components/auth/expiry-timer";

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
            const response = await fetch("/api/auth/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to send verification code");
                setIsLoading(false);
                return;
            }

            setExpiresAt(data.expiresAt);
            setCanResendAt(data.canResendAt);
            setStep("otp");
            setIsLoading(false);
        } catch {
            setError("An unexpected error occurred");
            setIsLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!otp || otp.length !== 6) {
            setError("Please enter a valid 6-digit code");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // First verify the OTP
            const verifyResponse = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok) {
                setError(verifyData.error || "Invalid verification code");
                setIsLoading(false);
                return;
            }

            // OTP verified, now sign in with credentials
            const result = await signIn("otp", {
                email,
                otp,
                redirect: false,
                callbackUrl,
            });

            if (result?.error) {
                setError(result.error);
                setIsLoading(false);
            } else if (result?.ok) {
                // Successfully signed in
                router.push(callbackUrl);
                router.refresh();
            }
        } catch {
            setError("An unexpected error occurred");
            setIsLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setError(null);
        setOtp("");

        try {
            const response = await fetch("/api/auth/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to resend verification code");
                return;
            }

            setExpiresAt(data.expiresAt);
            setCanResendAt(data.canResendAt);
        } catch {
            setError("Failed to resend verification code");
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
        setError("Verification code has expired. Please request a new one.");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="max-w-md w-full">
                {/* Logo / Brand */}
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

                {/* Login Form */}
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

                {/* Security note */}
                <p className="text-center text-xs text-muted-foreground mt-6">
                    {step === "email"
                        ? t("codeExpires", { minutes: 5 })
                        : t("codeSecurityNote")}
                </p>
            </div>
        </div>
    );
}
