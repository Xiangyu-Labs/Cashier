import { createHmac } from "node:crypto";
import { runtimeEnv } from "@/lib/env/runtime";

export function logIdentifier(kind: "email" | "ip", value: string): string {
  const digest = createHmac("sha256", runtimeEnv.apiKeyPepper)
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${kind}:${digest}`;
}
