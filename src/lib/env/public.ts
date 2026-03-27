export interface PublicEnv {
  readonly appUrl: string;
  readonly oidcEnabled: boolean;
  readonly oidcButtonName: string;
}

function resolvePublicValue(value: string | undefined, fallback: string): string {
  return value != null && value.trim() !== "" ? value : fallback;
}

export const publicEnv: PublicEnv = {
  get appUrl() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
  },
  get oidcEnabled() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_OIDC_ENABLED, "false") === "true";
  },
  get oidcButtonName() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME, "SSO");
  },
};
