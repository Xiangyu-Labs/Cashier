import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { entryCategories, ledgers, type Ledger } from "@/persistence";
import { getDefaultLedger } from "@/config/default-ledger";

export async function createDefaultLedger(input: {
  userId: string;
  locale?: string;
}): Promise<Ledger> {
  const locale = input.locale ?? "zh";
  const defaultLedger = getDefaultLedger(locale);

  const newLedger = db.transaction((tx) => {
    const result = tx
      .insert(ledgers)
      .values({
        userId: input.userId,
        metadata: {
          settings: {
            ...defaultLedger.settings,
          },
        },
      })
      .returning()
      .all();

    if (result.length === 0) {
      throw new AppError("Failed to create default ledger", "LEDGER_CREATION_FAILED");
    }

    const createdLedger = result[0];
    if (createdLedger == null) {
      throw new AppError("Failed to create default ledger", "LEDGER_CREATION_FAILED");
    }

    if (defaultLedger.categories.length > 0) {
      tx.insert(entryCategories)
        .values(
          defaultLedger.categories.map((category) => ({
            ...category,
            ledgerId: createdLedger.id,
          }))
        )
        .run();
    }

    return createdLedger;
  });

  return newLedger;
}
