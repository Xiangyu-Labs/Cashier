import type { GetEnhancedStatsInput } from "../contract-schemas";
import type { EnhancedStatsDto } from "../contracts";

export interface StatsReadPort {
  queryEnhanced(input: GetEnhancedStatsInput): Promise<EnhancedStatsDto>;
  getEnhanced(input: GetEnhancedStatsInput): Promise<EnhancedStatsDto>;
}
