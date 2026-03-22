"use server";
import { headers } from "next/headers";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { parseSendOTPEmail } from "../contract-schemas";
import { sendOTP } from "../use-cases";

export async function sendOTPAction(email: string, _locale: string = "en") {
  const validatedEmail = parseSendOTPEmail(email);
  const requestHeaders = await headers();
  return sendOTP({
    email: validatedEmail,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
  });
}
