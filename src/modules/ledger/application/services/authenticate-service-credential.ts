import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { logError } from "@/lib/error-handlers";
import { serviceCredentials } from "@/persistence/schema/ledger";

type ServiceCredentialRecord = typeof serviceCredentials.$inferSelect;

export async function authenticateServiceCredential(
  key: string
): Promise<ServiceCredentialRecord | null> {
  const credential = await db.query.serviceCredentials.findFirst({
    where: and(eq(serviceCredentials.key, key), isNull(serviceCredentials.deletedAt)),
  });

  if (credential == null) {
    return null;
  }

  try {
    await db
      .update(serviceCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(serviceCredentials.id, credential.id));
  } catch (error) {
    logError("modules/ledger:authenticate-service-credential:update-last-used", error);
  }

  return credential;
}
