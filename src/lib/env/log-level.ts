export function getConfiguredLogLevel(): string | undefined {
  const value = process.env.LOG_LEVEL?.trim();
  return value === "" ? undefined : value;
}
