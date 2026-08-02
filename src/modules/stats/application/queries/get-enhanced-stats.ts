import type { GetEnhancedStatsInput } from "@/modules/stats/contract-schemas";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";
import type { StatsReadPort } from "../ports";

export function getEnhancedStatsQuery(
  input: GetEnhancedStatsInput,
  stats: StatsReadPort
): Promise<EnhancedStatsDto> {
  return stats.queryEnhanced(input);
}

export function getEnhancedStats(
  input: GetEnhancedStatsInput,
  stats: StatsReadPort
): Promise<EnhancedStatsDto> {
  return stats.getEnhanced(input);
}
