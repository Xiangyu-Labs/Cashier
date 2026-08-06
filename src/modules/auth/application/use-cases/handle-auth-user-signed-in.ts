import { sendLoginNotification } from "@/modules/auth/services/notifications";
import type { EmailDeliveryPort } from "@/application/contracts";

export async function handleAuthUserSignedIn(
  params: {
    userId?: string | null;
    email?: string | null;
    locale?: string | null;
    isNewUser?: boolean;
  },
  dependencies: { emailDelivery: EmailDeliveryPort }
): Promise<void> {
  if (params.isNewUser === true) {
    return;
  }

  if (params.email == null || params.email === "") {
    return;
  }

  await sendLoginNotification(
    {
      email: params.email,
      ...(params.locale != null && params.locale !== "" ? { locale: params.locale } : {}),
    },
    dependencies.emailDelivery
  );
}
