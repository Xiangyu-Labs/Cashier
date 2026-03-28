import { vi } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

// Load .env.local so API keys are available without dotenv
const envLocalPath = path.resolve(".env.local")
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = val
  }
}

// Stub DB — pipeline Stage 0 does a findFirst to update metadata;
// returning null just skips that update, which is fine for smoke tests.
vi.mock("@/lib/db", () => ({
  db: {
    query: { sourceDocuments: { findFirst: vi.fn().mockResolvedValue(null) } },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
}))

// Do NOT set fake defaults for OPENAI_API_KEY / AI_MODEL_TEXT / AI_MODEL_VISION.
// They must come from .env.local so real AI is called.
