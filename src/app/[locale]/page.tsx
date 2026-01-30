"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { useRouter } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLedgers, createLedger } from "@/lib/api";
import { useTranslations, useLocale } from "next-intl";

export default function HomePage(): ReactNode {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("HomePage");
  const queryClient = useQueryClient();
  const creatingRef = useRef(false);
  const [statusText, setStatusText] = useState(t("loading"));

  const { data: ledgers, isLoading } = useQuery({
    queryKey: ["ledgers"],
    queryFn: fetchLedgers,
  });

  useEffect(() => {
    const handleInit = async () => {
      // Wait for loading to finish
      if (isLoading || !ledgers) {
        return;
      }

      // If ledgers exist, redirect to the first one
      if (ledgers.length > 0) {
        router.replace(`/ledger/${ledgers[0].id}`);
        return;
      }

      // If already creating, do nothing
      if (creatingRef.current) {
        return;
      }

      // Auto create default ledger
      creatingRef.current = true;
      setStatusText(t("creating"));

      try {
        const newLedger = await createLedger({
          name: t("defaultLedgerName"),
          aiLanguage: locale
        });
        await queryClient.invalidateQueries({ queryKey: ["ledgers"] });
        router.replace(`/ledger/${newLedger.id}`);
      } catch (error) {
        console.error("Failed to auto-create ledger:", error);
        creatingRef.current = false;
        setStatusText(t("createFailed"));
      }
    };

    handleInit();
  }, [ledgers, isLoading, router, queryClient, t, locale]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted">{statusText}</p>
      </div>
    </div>
  );
}
