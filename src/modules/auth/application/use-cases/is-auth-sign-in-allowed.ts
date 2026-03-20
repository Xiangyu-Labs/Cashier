import { isRegistrationAllowed } from "./registration-policy";

export async function isAuthSignInAllowed(params: {
  email?: string | null;
}): Promise<boolean> {
  if (params.email == null || params.email === "") {
    return true;
  }

  return isRegistrationAllowed(params.email);
}
