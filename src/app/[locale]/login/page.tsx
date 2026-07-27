import { AuthLoginPage } from "@/modules/auth/ui";
import { runtimeEnv } from "@/lib/env/runtime";
import { isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";

export default function LoginPage() {
  return (
    <AuthLoginPage
      emailAuthEnabled={runtimeEnv.authResendKey != null}
      devAuthAvailable={isDevAuthBypassEnabled()}
    />
  );
}
