"use server";

import { headers } from "next/headers";
import { signOut } from "@/auth";
import { withAuth } from "@/lib/auth-actions";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { deleteAccount as deleteAccountUseCase, sendOTP } from "./use-cases";

export async function sendOTPAction(email: string, _locale: string = "en") {
  const requestHeaders = await headers();

  return sendOTP({
    email,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
  });
}

export const deleteAccount = withAuth(async (userId: string) => {
  await deleteAccountUseCase(userId);
  await signOut({ redirectTo: "/" });
});
