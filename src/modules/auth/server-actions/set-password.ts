"use server";
import { withAuth } from "@/lib/auth-actions";
import { setPassword as setPasswordUseCase } from "../use-cases";

export const setPassword = withAuth(async (userId: string, newPassword: string, confirmPassword: string) => {
  await setPasswordUseCase({ userId, newPassword, confirmPassword });
});
