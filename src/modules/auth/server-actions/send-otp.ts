"use server";
import { headers } from "next/headers";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { sendOTP } from "../use-cases";

export async function sendOTPAction(email: string, _locale: string = "en") {
  const requestHeaders = await headers();
  return sendOTP({
    email,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
  });
}
