import pino from "pino";
import { getConfiguredLogLevel } from "@/lib/env/log-level";

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";
const defaultLevel = isTest ? "silent" : "info";
const configuredLogLevel = getConfiguredLogLevel();

/**
 * Global logger instance
 * Best Practice: Use standard JSON for production, and pino-pretty for development.
 */
export const logger = pino({
  level: configuredLogLevel ?? defaultLevel,
  // Pino only auto-applies its Error serializer to the `err` key. Almost all
  // call sites in this codebase log under `error` instead, which without
  // this would serialize an Error's non-enumerable `message`/`stack` away to
  // `{}` and make failures undiagnosable from logs alone.
  serializers: { error: pino.stdSerializers.err },
  ...(isDev && process.env.NEXT_RUNTIME === "nodejs"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export default logger;
