"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useLocale } from "next-intl";
import { useConnectionState } from "./connection-state";

export function ConnectionBanner() {
  const { status, retryInSeconds, retry } = useConnectionState();
  const locale = useLocale();
  if (status === "online") return null;
  const zh = locale.startsWith("zh");
  const label =
    status === "checking"
      ? zh
        ? "正在尝试恢复连接"
        : "Trying to restore connection"
      : status === "recovered"
        ? zh
          ? "连接已恢复"
          : "Connection restored"
        : retryInSeconds == null
          ? zh
            ? "离线"
            : "Offline"
          : zh
            ? `离线，下次重试 ${retryInSeconds} 秒`
            : `Offline, retrying in ${retryInSeconds}s`;
  const Icon = status === "recovered" ? Wifi : status === "offline" ? WifiOff : RefreshCw;
  return (
    <div className="sticky top-0 z-[60] flex min-h-10 items-center justify-center gap-2 border-b border-border bg-surface px-3 text-sm text-text">
      <Icon className={status === "checking" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      <span>{label}</span>
      {status !== "recovered" && (
        <button type="button" onClick={retry} className="ml-1 font-medium text-primary hover:underline">
          {zh ? "立即重试" : "Retry now"}
        </button>
      )}
    </div>
  );
}
