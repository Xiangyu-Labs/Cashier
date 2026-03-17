"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

interface SSOButtonProps {
  callbackUrl?: string;
}

export function SSOButton({ callbackUrl = "/" }: SSOButtonProps) {
  const t = useTranslations("Auth");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSignIn = () => {
    setIsRedirecting(true);
    void signIn("oidc", { callbackUrl });
  };

  const envButtonName = process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME;
  const buttonName = envButtonName !== "" && envButtonName != null ? envButtonName : t("signInWithSSO");

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11"
      onClick={handleSignIn}
      disabled={isRedirecting}
    >
      {isRedirecting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("redirecting")}
        </>
      ) : (
        buttonName
      )}
    </Button>
  );
}
