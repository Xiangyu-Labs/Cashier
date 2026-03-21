"use server";
import { signOut } from "@/auth";
import { withAuth } from "@/lib/auth-actions";
import { deleteAccount as deleteAccountUseCase } from "../use-cases";

export const deleteAccount = withAuth(async (userId: string) => {
  await deleteAccountUseCase(userId);
  await signOut({ redirectTo: "/" });
});
