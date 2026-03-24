"use client";

import { useEffect } from "react";
import { AlertCircle, LayoutDashboard, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tError = useTranslations("Error");
  const tAdminError = useTranslations("AdminError");

  useEffect(() => {
    console.error("Admin Error:", props.error);
  }, [props.error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div className="mt-6 space-y-2">
          <h1 className="text-xl font-semibold text-text">{tAdminError("title")}</h1>
          <p className="text-sm leading-6 text-muted">{tAdminError("description")}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button className="w-full gap-2" onClick={() => props.reset()}>
            <RefreshCcw className="h-4 w-4" />
            {tError("retry")}
          </Button>
          <Button variant="outline" className="w-full gap-2" asChild>
            <Link href="/">
              <LayoutDashboard className="h-4 w-4" />
              {tAdminError("backHome")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
