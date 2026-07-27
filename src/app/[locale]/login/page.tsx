import { AuthLoginPage } from "@/modules/auth/ui";
import { runtimeEnv } from "@/lib/env/runtime";

export default function LoginPage() {
  return <AuthLoginPage emailAuthEnabled={runtimeEnv.authResendKey != null} />;
}
