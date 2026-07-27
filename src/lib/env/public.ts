import { ENV_DEFAULTS } from "./startup";

export interface PublicEnv {
  readonly devAuthBypass: boolean;
}

function resolvePublicValue(value: string | undefined, fallback: string): string {
  return value != null && value.trim() !== "" ? value : fallback;
}

export const publicEnv: PublicEnv = {
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
