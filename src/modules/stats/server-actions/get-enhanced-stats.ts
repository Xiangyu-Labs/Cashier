"use server";
import { requireLedgerAccess } from "@/modules/ledger/access";
import { getEnhancedStatsQuery } from "../application/queries/get-enhanced-stats";
import { parseEnhancedStatsInput } from "../contract-schemas";
import type { EnhancedStatsDto } from "../contracts";

export async function getEnhancedStats({
  ledgerId,
  queryRange,
  compareRange,
}: {
  ledgerId: string;
  queryRange: { from: string; to: string };
  compareRange: { from: string; to: string };
}): Promise<EnhancedStatsDto> {
  const input = parseEnhancedStatsInput({ ledgerId, queryRange, compareRange });
  await requireLedgerAccess(input.ledgerId);
  return getEnhancedStatsQuery(input);
}
