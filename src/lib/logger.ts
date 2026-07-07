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
