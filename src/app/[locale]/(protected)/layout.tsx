import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const locale = await getLocale();

    if (!session) {
        redirect(`/${locale}/login`);
    }

    return <>{children}</>;
}
