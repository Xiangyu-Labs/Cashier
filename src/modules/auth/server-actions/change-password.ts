"use server";
import { withAuth } from "@/lib/auth-actions";
import { changePassword as changePasswordUseCase } from "../use-cases";

export const changePassword = withAuth(async (userId: string, currentPassword: string, newPassword: string, confirmPassword: string) => {
  await changePasswordUseCase({ userId, currentPassword, newPassword, confirmPassword });
});
