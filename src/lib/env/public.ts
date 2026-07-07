import { ENV_DEFAULTS } from "./startup";

export interface PublicEnv {
  readonly appUrl: string;
  readonly devAuthBypass: boolean;
}

function resolvePublicValue(value: string | undefined, fallback: string): string {
  return value != null && value.trim() !== "" ? value : fallback;
}

export const publicEnv: PublicEnv = {
  get appUrl() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_APP_URL, ENV_DEFAULTS.NEXT_PUBLIC_APP_URL);
  },
  get devAuthBypass() {
    return (
      process.env.NODE_ENV !== "production" &&
      resolvePublicValue(
        process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS,
        ENV_DEFAULTS.NEXT_PUBLIC_DEV_AUTH_BYPASS
      ) === "true"
    );
  },
};
