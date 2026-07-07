"use server";
import { signOut } from "@/auth";
import { withAuth } from "@/lib/auth-actions";
import { deleteAccount as deleteAccountUseCase } from "@/modules/auth/application/use-cases/delete-account";

export const deleteAccount = withAuth(async (userId: string, email: string, otp: string) => {
  await deleteAccountUseCase({ userId, email, otp });
  await signOut({ redirectTo: "/" });
});
