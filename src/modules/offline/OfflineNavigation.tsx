"use client";

import { useEffect, useRef } from "react";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { useConnectionState } from "./connection-state";

export function OfflineNavigation() {
  const { status } = useConnectionState();
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
  return <TabNavigation activeTab="stream" onTabChange={() => {}} onOpenInput={() => {}} offline />;
}
