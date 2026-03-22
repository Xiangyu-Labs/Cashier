"use server";
import { headers } from "next/headers";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { sendOTP } from "@/modules/auth/use-cases";
import { parseSendOTPEmail } from "../contract-schemas";

export async function sendOTPAction(email: string, _locale: string = "en") {
  const validatedEmail = parseSendOTPEmail(email);
  const requestHeaders = await headers();
  return sendOTP({
    email: validatedEmail,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
  });
}
