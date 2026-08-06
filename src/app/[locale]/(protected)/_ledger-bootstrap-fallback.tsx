"use client";

import { useRouter } from "next/navigation";
import { ledgerStartupCacheKey } from "@/modules/workspace/ledger-startup-cache-constants";
import { LedgerStartupPreview } from "@/modules/workspace/ui/LedgerStartupPreview";
import type { LedgerTab } from "@/modules/workspace/tabs";

interface LedgerBootstrapFallbackProps {
  userId: string;
  ledgerId: string;
  activeTab: LedgerTab;
}

/**
 * Rendered inside the shell while the server bootstrap streams. Mounts the
 * IndexedDB startup preview (or its skeleton) immediately so the shell,
 * preview, and retry button are never blocked by the bootstrap queries.
 */
export function LedgerBootstrapFallback({
  userId,
  ledgerId,
  activeTab,
}: LedgerBootstrapFallbackProps) {
  const router = useRouter();
  return (
    <LedgerStartupPreview
      snapshotKey={ledgerStartupCacheKey(userId, ledgerId)}
      activeTab={activeTab}
      queryState="loading"
      onRetry={() => router.refresh()}
    />
  );
}
