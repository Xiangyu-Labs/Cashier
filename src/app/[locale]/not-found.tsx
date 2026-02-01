import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export default function NotFound() {
    const t = useTranslations("NotFound");

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="max-w-md w-full text-center">
                <div className="mb-8 flex justify-center">
                    <div className="relative">
                        <div className="text-9xl font-bold text-surface2 select-none">404</div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-primary"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                <h1 className="text-2xl font-bold text-text mb-4">
                    {t("title")}
                </h1>
                <p className="text-muted mb-8">
                    {t("description")}
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-2"
                    >
                        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    {t("backToHome")}
                </Link>
            </div>
        </div>
    );
}
