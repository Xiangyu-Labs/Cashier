import { ensureUserLedger } from "@/modules/workspace/use-cases";

export async function handleAuthUserCreated(params: { userId?: string | null }): Promise<void> {
  if (params.userId == null || params.userId === "") {
    return;
  }

  await ensureUserLedger({
    userId: params.userId,
  });
}
