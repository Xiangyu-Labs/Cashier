"use server";
import { withAuth } from "@/lib/auth-actions";
import { changeEmail as changeEmailUseCase } from "../use-cases";

export const changeEmail = withAuth(async (userId: string, newEmail: string, otp: string) => {
  await changeEmailUseCase({ userId, newEmail, otp });
});
