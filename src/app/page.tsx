"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { useRouter } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLedgers, createLedger, ApiError } from "@/lib/api";
import { useTranslations, useLocale } from "next-intl";
import { useSession, signOut } from "next-auth/react";

export default function HomePage(): ReactNode {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("HomePage");
  const queryClient = useQueryClient();
  const creatingRef = useRef(false);
  const [statusText, setStatusText] = useState(t("loading"));

  // Get the current session
  const { data: session, status: sessionStatus } = useSession();

  const { data: ledgers, isLoading, error: ledgersError } = useQuery({
    queryKey: ["ledgers"],
    queryFn: fetchLedgers,
    // Only fetch when authenticated
    enabled: sessionStatus === "authenticated",
  });

  useEffect(() => {
    const handleInit = async () => {
      // Wait for session to be determined
      if (sessionStatus === "loading") {
        return;
      }

      // If not authenticated, SessionManager or middleware will redirect to login
      if (sessionStatus === "unauthenticated") {
        return;
      }

      // Handle ledgers fetch error (e.g., 401 for invalid session)
      if (ledgersError instanceof ApiError && ledgersError.status === 401) {
        console.log("Session invalid (401 on ledgers fetch), signing out...");
        signOut({ callbackUrl: "/login" });
        return;
      }

      // Wait for ledgers loading to finish
      if (isLoading || !ledgers) {
        return;
      }

      // If we have a default ledger ID in the session, use it
      if (session?.user?.defaultLedgerId) {
        router.replace(`/ledger/${session.user.defaultLedgerId}`);
        return;
      }

      // If ledgers exist, redirect to the first one (safety fallback if session doesn't have it yet)
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
        // Handle 401 error (user not found in DB)
        if (error instanceof ApiError && error.status === 401) {
          console.log("Session invalid (401 on ledger creation), signing out...");
          signOut({ callbackUrl: "/login" });
          return;
        }

        console.error("Failed to auto-create ledger:", error);
        creatingRef.current = false;
        setStatusText(t("createFailed"));
      }
    };

    handleInit();
  }, [ledgers, isLoading, ledgersError, router, queryClient, t, locale, sessionStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted">{statusText}</p>
      </div>
    </div>
  );
}

