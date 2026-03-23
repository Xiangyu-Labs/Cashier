import { getEnvValue } from "./catalog";

export interface PublicEnv {
  readonly appUrl: string;
  readonly oidcEnabled: boolean;
  readonly oidcButtonName: string;
}

function readPublicValue(name: string): string {
  return getEnvValue(process.env, name) ?? "";
}

export const publicEnv: PublicEnv = {
  get appUrl() {
    return readPublicValue("NEXT_PUBLIC_APP_URL");
  },
  get oidcEnabled() {
    return readPublicValue("NEXT_PUBLIC_OIDC_ENABLED") === "true";
  },
  get oidcButtonName() {
    return readPublicValue("NEXT_PUBLIC_OIDC_BUTTON_NAME");
  },
};
