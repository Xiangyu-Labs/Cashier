import type { SettingsPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import type { UpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { omitUndefinedProperties } from "@/lib/validation";

export async function updateLedger(
  userId: string,
  ledgerId: string,
  data: UpdateLedgerInput,
  settings: SettingsPort
): Promise<LedgerDto> {
  const updated = await settings.updateWithCurrencyRecalculation({
    ledgerId,
    userId,
    expectedUpdatedAt: data.expectedUpdatedAt,
    settings: omitUndefinedProperties(data.settings ?? {}),
  });
  if (updated == null) throw new NotFoundError("Ledger");
  return {
    id: updated.id,
    userId: updated.userId,
    settings: updated.settings,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
