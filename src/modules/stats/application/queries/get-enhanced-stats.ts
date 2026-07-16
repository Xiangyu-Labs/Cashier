import { currentApplication } from "@/application/current";
import type { GetEnhancedStatsInput } from "@/modules/stats/contract-schemas";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";

export function getEnhancedStatsQuery(input: GetEnhancedStatsInput): Promise<EnhancedStatsDto> {
  return currentApplication.stats.queryEnhanced(input);
}

export function getEnhancedStats(input: GetEnhancedStatsInput): Promise<EnhancedStatsDto> {
  return currentApplication.stats.getEnhanced(input);
}
