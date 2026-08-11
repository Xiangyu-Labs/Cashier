export interface AuthenticatedUserDto {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  interfaceLanguage: InterfaceLanguage;
}

export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  locale?: string | null;
  /**
   * OTP-only: the verified token is claimed but not yet consumed. The
   * interactive sign-in orchestrator consumes it only after cross-module
   * completion (default ledger setup) succeeds, and releases it on failure.
   */
  pendingOtpClaim?: { email: string; tokenHash: string };
}

export type InterfaceLanguage = "auto" | "zh" | "en";

export interface UserPreferences {
  interfaceLanguage: InterfaceLanguage;
}

export type PasswordMutationActionErrorCode =
  | "password_too_short"
  | "password_requirements_not_met"
  | "password_mismatch"
  | "current_password_wrong"
  | "validation_failed"
  | "conflict"
  | "unexpected";

export type PasswordMutationActionResult =
  { ok: true; passwordUpdatedAt: string } | { ok: false; code: PasswordMutationActionErrorCode };
