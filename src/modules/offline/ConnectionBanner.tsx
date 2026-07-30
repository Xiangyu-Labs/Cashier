"use client";

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
  return (
    <div className="sticky top-0 z-[60] flex min-h-10 items-center justify-center gap-2 border-b border-border bg-surface px-3 text-sm text-text">
      <span
        aria-hidden
        className={
          status === "checking"
            ? "size-3 animate-spin rounded-full border-2 border-info/25 border-t-info"
            : `size-2 rounded-full ${status === "offline" ? "bg-warning" : "bg-success"}`
        }
      />
      <span>{label}</span>
      {status !== "recovered" && (
        <button
          type="button"
          onClick={retry}
          className="ml-1 font-medium text-primary hover:underline"
        >
          {zh ? "立即重试" : "Retry now"}
        </button>
      )}
    </div>
  );
}
