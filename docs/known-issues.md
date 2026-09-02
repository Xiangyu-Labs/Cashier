# Known Issues

## P1-05: Invalid `LOG_LEVEL` can fail during logger initialization

**Severity:** P1

**Current evidence:** `src/lib/env/startup.ts` accepts `LOG_LEVEL` as an arbitrary non-empty string,
`src/lib/env/log-level.ts` returns it unchanged, and `src/lib/logger.ts` passes it directly to Pino.

**Impact:** A misspelled log level can crash startup before the normal environment validation path
produces a clear configuration error.

## P2-15: `MAX_INPUT_PIXELS` does not control the Sharp decode limit

**Severity:** P2

**Current evidence:** `src/lib/env/runtime.ts` exposes `MAX_INPUT_PIXELS`, while
`src/lib/storage/image-processing.ts` derives Sharp's decode ceiling from the fixed 16 MP upload
policy and does not read the environment value.

**Impact:** Operators can change the compatibility setting without changing runtime behavior. The
effective limits remain 16 MP for business validation and 24 MP for Sharp decoding.
