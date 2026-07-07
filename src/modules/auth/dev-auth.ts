export const DEV_AUTH_EMAIL = "dev@cashier.local";
export const DEV_AUTH_NAME = "Local Developer";

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";
}
