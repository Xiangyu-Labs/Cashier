import type { LedgerSettingsViewDto } from "@/modules/ledger/contracts";
import { listServiceCredentials } from "./list-service-credentials";
import type { CategoryPort, ServiceCredentialPort } from "@/application/contracts";

export async function getLedgerSettingsView(
  ledgerId: string,
  dependencies: {
    categories: Pick<CategoryPort, "countUncategorized">;
    credentials: Pick<ServiceCredentialPort, "list">;
  }
): Promise<LedgerSettingsViewDto> {
  const [uncategorizedCount, credentials] = await Promise.all([
    dependencies.categories.countUncategorized(ledgerId),
    listServiceCredentials(ledgerId, dependencies.credentials),
  ]);

  return {
    uncategorizedCount,
    credentials,
  };
}
