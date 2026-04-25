"use server";
import { withAuth } from "@/lib/auth-actions";
import { clearUserData as clearUserDataUseCase } from "../use-cases";

export const clearUserData = withAuth(async (userId) => {
  await clearUserDataUseCase({ userId });
});
