import {
  parseEnhancedStatsInput,
  type GetEnhancedStatsInput,
} from "@/modules/stats/contract-schemas";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";
import type { StatsReadPort } from "../ports";

export function getEnhancedStatsQuery(
  input: GetEnhancedStatsInput,
  stats: Pick<StatsReadPort, "queryEnhanced">
): Promise<EnhancedStatsDto> {
  return stats.queryEnhanced(input);
}

export async function getEnhancedStats(
  input: unknown,
  stats: Pick<StatsReadPort, "queryEnhanced">
): Promise<EnhancedStatsDto> {
  const validatedInput = parseEnhancedStatsInput(input);
  return stats.queryEnhanced(validatedInput);
}
