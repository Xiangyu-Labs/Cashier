import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { sendLoginNotification } from "@/modules/auth/services/notifications";
import type { EmailDeliveryPort, LedgerPort } from "@/application/contracts";

export async function handleAuthUserSignedIn(
  params: {
    userId?: string | null;
    email?: string | null;
    locale?: string | null;
    isNewUser?: boolean;
  },
  dependencies: { ledgers: LedgerPort; emailDelivery: EmailDeliveryPort }
): Promise<void> {
  if (params.isNewUser === true) {
    return;
  }

  if (
    params.userId == null ||
    params.userId === "" ||
    params.email == null ||
    params.email === ""
  ) {
    return;
  }

  await ensureUserLedger({ userId: params.userId }, dependencies.ledgers);

  await sendLoginNotification(
    {
      email: params.email,
      ...(params.locale != null && params.locale !== "" ? { locale: params.locale } : {}),
    },
    dependencies.emailDelivery
  );
}
