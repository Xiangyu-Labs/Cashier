"use server";
import { withAuth } from "@/lib/auth-actions";
import { clearUserData as clearUserDataUseCase } from "@/modules/auth/application/use-cases/clear-user-data";

export const clearUserData = withAuth(async (userId) => {
  await clearUserDataUseCase({ userId });
});
