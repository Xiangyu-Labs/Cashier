import { createHmac } from "node:crypto";
import { runtimeEnv } from "@/lib/env/runtime";

export type LogIdentifierKind =
  | "email"
  | "ip"
  | "user"
  | "ledger"
  | "source-document"
  | "revision"
  | "stored-file"
  | "processing-intent"
  | "upload-session";

export function logIdentifier(kind: LogIdentifierKind, value: string): string {
  const digest = createHmac("sha256", runtimeEnv.apiKeyPepper)
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${kind}:${digest}`;
}
