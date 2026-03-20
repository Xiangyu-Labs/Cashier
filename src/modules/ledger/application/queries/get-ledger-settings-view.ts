import type { LedgerSettingsViewDto } from "@/modules/ledger/contracts";
import { getUncategorizedEntryCount } from "./get-uncategorized-entry-count";
import { listServiceCredentials } from "./list-service-credentials";

export async function getLedgerSettingsView(ledgerId: string): Promise<LedgerSettingsViewDto> {
  const [uncategorizedCount, credentials] = await Promise.all([
    getUncategorizedEntryCount(ledgerId),
    listServiceCredentials(ledgerId),
  ]);

  return {
    uncategorizedCount,
    credentials,
  };
}
