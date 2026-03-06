"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { sendOTPAction, verifyOTPAction } from "@/features/auth/server/actions/auth";
import { OTP_LENGTH } from "@/features/auth/server/services/otp";

type LoginStep = "email" | "otp";

interface UseLoginFlowReturn {
    step: LoginStep;
    email: string;
    otp: string;
    isLoading: boolean;
    error: string | null;
    expiresAt: number | null;
    canResendAt: number | null;
    setEmail: (email: string) => void;
    setOtp: (otp: string) => void;
    handleSendOTP: (e: React.FormEvent) => Promise<void>;
    handleVerifyOTP: () => Promise<void>;
    handleResendOTP: () => Promise<void>;
    handleChangeEmail: () => void;
    handleOTPExpired: () => void;
}

export function useLoginFlow(
    t: (key: string, values?: Record<string, string | number>) => string
): UseLoginFlowReturn {
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
        if (!otp || otp.length !== OTP_LENGTH) {
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

    return {
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
    };
}
