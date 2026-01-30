"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "@/i18n/routing";

export default function LoginErrorPage() {
    const t = useTranslations("Auth");

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="max-w-md w-full text-center">
                {/* Error Icon */}
                <div className="mb-8">
                    <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-10 h-10 text-destructive" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-text mb-2">
                    {t("error")}
                </h1>

                {/* Description */}
                <p className="text-muted mb-8">
                    {t("errorDesc")}
                </p>

                {/* Try Again Button */}
                <Link href="/login">
                    <Button className="h-11 px-8">
                        {t("tryAgain")}
                    </Button>
                </Link>
            </div>
        </div>
    );
}
