import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";

export async function handleAuthUserCreated(params: { userId?: string | null }): Promise<void> {
  if (params.userId == null || params.userId === "") {
    return;
  }

  await ensureUserLedger({
    userId: params.userId,
  });
}
