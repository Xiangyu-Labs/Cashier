import type {
  EmailDeliveryPort,
  LedgerPort,
  OtpTokenPort,
  UserAccountPort,
} from "@/application/contracts";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { AUTH_ERROR_CODES, AuthSignInError } from "@/modules/auth/errors";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";
import { consumeOTPClaim, releaseOTPClaim } from "@/modules/auth/services/otp-verification";
import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { sendLoginNotification } from "@/modules/auth/services/notifications";

/**
 * Complete the cross-domain part of an interactive sign-in.
 *
 * Auth application use cases authenticate an account only. This composition
 * use case is the single place that ensures the user's default ledger exists
 * and commits (or releases) a pending OTP claim only after that completes.
 */
export async function completeInteractiveSignIn(
  principal: AuthenticatedPrincipal,
  dependencies: {
    ledgers: Pick<LedgerPort, "listForUser" | "createDefault">;
    otpTokens: OtpTokenPort;
    users: UserAccountPort;
    emailDelivery: EmailDeliveryPort;
  }
): Promise<AuthenticatedPrincipal> {
  const claim = principal.pendingOtpClaim ?? null;
  try {
    await ensureUserLedger(
      {
        userId: principal.id,
        ...(principal.locale != null && principal.locale !== ""
          ? { locale: principal.locale }
          : {}),
      },
      dependencies.ledgers
    );
    if (principal.registrationCompletedAt == null) {
      await dependencies.users.completeRegistration(principal.id, new Date());
    }
  } catch (error) {
    if (claim != null) {
      await releaseOTPClaim(claim, dependencies.otpTokens).catch((releaseError) => {
        logger.error(
          { error: releaseError, subject: logIdentifier("email", claim.email) },
          "Failed to release OTP claim after sign-in completion failed"
        );
      });
    }
    throw error;
  }

  if (principal.isNewUser !== true && principal.email != null && principal.email !== "") {
    await sendLoginNotification(
      {
        email: principal.email,
        ...(principal.locale == null ? {} : { locale: principal.locale }),
      },
      dependencies.emailDelivery
    );
  }

  if (claim == null) {
    const { isNewUser: _isNewUser, ...completedPrincipal } = principal;
    return completedPrincipal;
  }

  let consumed: boolean;
  try {
    consumed = await consumeOTPClaim(claim, dependencies.otpTokens);
  } catch (error) {
    await releaseOTPClaim(claim, dependencies.otpTokens).catch((releaseError) => {
      logger.error(
        { error: releaseError, subject: logIdentifier("email", claim.email) },
        "Failed to release OTP claim after consume failed"
      );
    });
    throw error;
  }
  if (!consumed) {
    throw new AuthSignInError(AUTH_ERROR_CODES.OTP_INVALID);
  }

  // Never let the transient claim leak into the Auth.js user/JWT payload.
  const {
    pendingOtpClaim: _pendingOtpClaim,
    isNewUser: _isNewUser,
    ...completedPrincipal
  } = principal;
  return completedPrincipal;
}
