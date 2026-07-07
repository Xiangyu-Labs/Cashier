import { ENV_DEFAULTS } from "./startup";

export interface PublicEnv {
  readonly appUrl: string;
}

function resolvePublicValue(value: string | undefined, fallback: string): string {
  return value != null && value.trim() !== "" ? value : fallback;
}

export const publicEnv: PublicEnv = {
  get appUrl() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_APP_URL, ENV_DEFAULTS.NEXT_PUBLIC_APP_URL);
  },
};
