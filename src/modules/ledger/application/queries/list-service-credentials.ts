import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { mapServiceCredentialDto } from "@/modules/ledger/application/mappers";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";
import { serviceCredentials } from "@/persistence/schema/ledger";

export async function listServiceCredentials(ledgerId: string): Promise<ServiceCredentialDto[]> {
  const q = forLedger(serviceCredentials, ledgerId);
  const credentials = await db.query.serviceCredentials.findMany({
    where: q.whereActive,
    orderBy: [desc(serviceCredentials.createdAt)],
  });

  return credentials.map(mapServiceCredentialDto);
}
