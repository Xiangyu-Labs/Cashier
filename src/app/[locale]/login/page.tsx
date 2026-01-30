"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
    const t = useTranslations("Auth");
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/";

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await signIn("resend", {
                email,
                redirect: false,
                callbackUrl,
            });

            if (result?.error) {
                setError(result.error);
                setIsLoading(false);
            } else {
                // Redirect to verify page
                router.push(`/login/verify?email=${encodeURIComponent(email)}`);
            }
        } catch {
            setError("An unexpected error occurred");
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="max-w-md w-full">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-text">
                        {t("welcomeBack")}
                    </h1>
                    <p className="text-muted mt-2">
                        {t("welcomeBackDesc")}
                    </p>
                </div>

                {/* Login Form */}
                <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                                    {t("sendMagicLink")}
                                </>
                            )}
                        </Button>
                    </form>
                </div>

                {/* Security note */}
                <p className="text-center text-xs text-muted mt-6">
                    {t("linkExpires", { minutes: 15 })}
                </p>
            </div>
        </div>
    );
}
