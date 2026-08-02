import type { LedgerSettingsViewDto } from "@/modules/ledger/contracts";
import { getUncategorizedEntryCount } from "./get-uncategorized-entry-count";
import { listServiceCredentials } from "./list-service-credentials";
import type { CategoryPort, ServiceCredentialPort } from "@/application/contracts";

export async function getLedgerSettingsView(
  ledgerId: string,
  dependencies: { categories: CategoryPort; credentials: ServiceCredentialPort }
): Promise<LedgerSettingsViewDto> {
  const [uncategorizedCount, credentials] = await Promise.all([
    getUncategorizedEntryCount(ledgerId, dependencies.categories),
    listServiceCredentials(ledgerId, dependencies.credentials),
  ]);

  return {
    uncategorizedCount,
    credentials,
  };
}
