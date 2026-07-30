"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { parseLedgerTab, type LedgerTab } from "@/modules/workspace/tabs";
import { useConnectionState } from "./connection-state";

export function OfflineNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useConnectionState();
  const activeTab = parseLedgerTab(searchParams);
  const returnUrl = useRef<string | null>(null);
  useEffect(() => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const isOfflineRoute = /\/offline\/?$/.test(window.location.pathname);
    if (!isOfflineRoute) sessionStorage.setItem("cashier.offline.returnUrl", current);
    returnUrl.current = isOfflineRoute
      ? sessionStorage.getItem("cashier.offline.returnUrl")
      : current;
  }, []);
  useEffect(() => {
    if (status === "recovered" && returnUrl.current != null) {
      window.location.replace(returnUrl.current);
    }
  }, [status]);
  const onTabChange = (tab: LedgerTab) => {
    if (tab === "settings") return;
    const next = new URLSearchParams(searchParams);
    if (tab === "stream") next.delete("tab");
    else next.set("tab", tab);
    router.replace(`${pathname}${next.size > 0 ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <TabNavigation activeTab={activeTab} onTabChange={onTabChange} onOpenInput={() => {}} offline />
  );
}
