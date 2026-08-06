import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { Providers } from "@/components/providers";
import { resolveAuthenticatedHome } from "@/modules/workspace/server/resolve-authenticated-home";
import { UnauthorizedError } from "@/lib/errors";
import { LocalePreferenceSync } from "@/components/LocalePreferenceSync";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  let context;
  try {
    context = await resolveAuthenticatedHome();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`/${locale}/login`);
    }
    throw error;
  }

  return (
    <Providers userId={context.userId}>
      <LocalePreferenceSync preference={context.session.user?.interfaceLanguage ?? "auto"} />
      {children}
    </Providers>
  );
}
