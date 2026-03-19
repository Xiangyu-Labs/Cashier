"use server";

import { requireLedgerAccess } from "@/modules/auth/helpers";
import { getEnhancedStatsQuery } from "./application/queries/get-enhanced-stats";
import type { EnhancedStatsDto } from "./contracts";

export async function getEnhancedStats({
  ledgerId,
  queryRange,
  compareRange,
}: {
  ledgerId: string;
  queryRange: { from: string; to: string };
  compareRange: { from: string; to: string };
}): Promise<EnhancedStatsDto> {
  await requireLedgerAccess(ledgerId);
  return getEnhancedStatsQuery({ ledgerId, queryRange, compareRange });
}
