import { ensureUserLedger } from "@/modules/workspace/use-cases";
import { sendLoginNotification } from "@/modules/auth/services/notifications";

export async function handleAuthUserSignedIn(params: {
  userId?: string | null;
  email?: string | null;
  locale?: string | null;
  isNewUser?: boolean;
}): Promise<void> {
  if (params.isNewUser === true) {
    return;
  }

  if (params.userId == null || params.userId === "" || params.email == null || params.email === "") {
    return;
  }

  await ensureUserLedger({
    userId: params.userId,
  });

  await sendLoginNotification({
    email: params.email,
    ...(params.locale != null && params.locale !== "" ? { locale: params.locale } : {}),
  });
}
