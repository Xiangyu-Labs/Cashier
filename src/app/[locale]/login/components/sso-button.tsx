"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";

interface SSOButtonProps {
    callbackUrl?: string;
}

export function SSOButton({ callbackUrl = "/" }: SSOButtonProps) {
    const t = useTranslations("Auth");

    const handleSignIn = () => {
        signIn("oidc", { callbackUrl });
    };

    const buttonName = process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME || t("signInWithSSO");

    return (
        <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={handleSignIn}
        >
            {buttonName}
        </Button>
    );
}
