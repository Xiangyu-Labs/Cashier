"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2 } from "lucide-react";
import { SSOButton } from "./sso-button";

interface EmailStepProps {
    email: string;
    isLoading: boolean;
    error: string | null;
    onEmailChange: (email: string) => void;
    onSubmit: (e: React.FormEvent) => void;
}

export function EmailStep({
    email,
    isLoading,
    error,
    onEmailChange,
    onSubmit,
}: EmailStepProps) {
    const t = useTranslations("Auth");

    return (
        <div className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-text">
                        {t("email")}
                    </label>
                    <Input
                        id="email"
                        type="email"
                        placeholder={t("emailPlaceholder")}
                        value={email}
                        onChange={(e) => onEmailChange(e.target.value)}
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

            <SSOSection />
        </div>
    );
}

function SSOSection() {
    const t = useTranslations("Auth");

    // Check if OIDC/SSO is enabled (build-time env var)
    const isSSOEnabled = process.env.NEXT_PUBLIC_OIDC_ENABLED === "true";

    if (!isSSOEnabled) {
        return null;
    }

    return (
        <div className="pt-2">
            {/* Simple divider with text */}
            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase text-muted-foreground">
                    {t("orContinueWith")}
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-4">
                <SSOButton />
            </div>
        </div>
    );
}
