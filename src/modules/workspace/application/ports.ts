export interface LedgerStartupCacheMetadataPort {
  get(ledgerId: string): Promise<{
    version: bigint;
    recordCount: number;
  }>;
}
