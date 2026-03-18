export interface AuthenticatedUserDto {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  defaultLedgerId?: string | null;
}

export interface ProvisionUserWorkspaceInput {
  userId: string;
  email: string;
  locale?: string;
  trigger: "auth-create-user" | "otp-sign-in" | "home-fallback" | "existing-login";
}
